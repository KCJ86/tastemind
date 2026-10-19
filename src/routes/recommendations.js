/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: Recommendations route — PostgreSQL version
 */
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const {
  saveVisit,
  getDailyRecommendationCount,
  logRecommendation,
  DAILY_RECOMMENDATION_LIMIT,
} = require("../services/userService");
const { getRestaurantRecommendations } = require("../services/claudeService");
const { getVisitContext } = require("../services/retrievalService");
const {
  searchRestaurant,
  getUserCoordinates,
} = require("../services/mapsService");
const { requireAuth } = require("../middleware/auth");

// Counted per signed-in user rather than per IP, so people sharing a network
// don't share a limit and one user can't dodge it by switching networks.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { error: "AI recommendation limit reached, wait a moment." },
});

router.use(requireAuth, aiLimiter);

// POST /api/v1/recommendations
router.post(
  "/",
  [
    body("craving")
      .trim()
      .notEmpty()
      .withMessage("Tell us what you are craving!"),
    body("location").optional().trim(),
    // Budget for this search: e.g. [1, 2] for $ to $$. Empty or missing = any.
    body("price_levels").optional().isArray({ max: 4 }),
    body("price_levels.*").isInt({ min: 1, max: 4 }).toInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { craving, location, radius } = req.body;
      const priceLevels = [...new Set(req.body.price_levels || [])].sort();
      const user = req.user;

      // Check daily limit
      const dailyCount = await getDailyRecommendationCount(user.id);
      if (dailyCount >= DAILY_RECOMMENDATION_LIMIT) {
        return res.status(429).json({
          error: `Daily recommendation limit reached (${DAILY_RECOMMENDATION_LIMIT}/day). Come back tomorrow!`,
          limit_reached: true,
        });
      }

      // RAG: recent meals + past reviews most relevant to this craving
      const visitContext = await getVisitContext(user.id, craving);
      console.log(
        `🔎 Context [${visitContext.mode}] recent=${visitContext.recent.length}`,
        visitContext.relevant.map(
          (v) => `${v.restaurant_name}(${Number(v.similarity).toFixed(2)})`,
        ),
      );

      const claudeResponse = await getRestaurantRecommendations(
        user,
        visitContext,
        craving,
        location,
        priceLevels,
      );

      const locationStr = location || user.location;
      const coordinates = await getUserCoordinates(locationStr);
      console.log(`📍 Coordinates for "${locationStr}":`, coordinates);

      // Log this recommendation
      await logRecommendation(user.id);

      // Run all 3 Places searches in parallel
      const options = await Promise.all(
        claudeResponse.options.map(async (option) => {
          const places = await searchRestaurant(
            option.search_query,
            priceLevels,
            radius || 10,
            coordinates,
          );
          return {
            label: option.label,
            places: places.slice(0, 2),
          };
        }),
      );

      const validOptions = options.filter((o) => o.places.length > 0);

      res.json({
        success: true,
        summary: claudeResponse.summary,
        vibe: claudeResponse.vibe,
        reason: claudeResponse.reason,
        options: validOptions,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not get recommendations" });
    }
  },
);

// POST /api/v1/recommendations/save
router.post(
  "/save",
  [
    body("place_id").trim().notEmpty(),
    body("restaurant_name").trim().notEmpty(),
    body("cuisine_type").optional().trim(),
    body("price_level").optional().isInt({ min: 1, max: 4 }),
    body("address").optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const visit = await saveVisit(req.user.id, req.body);
      res.status(201).json({
        success: true,
        visit_id: visit.lastInsertRowid,
        message: "Enjoy your meal! Don't forget to rate it after 🍽️",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not save visit" });
    }
  },
);

module.exports = router;
