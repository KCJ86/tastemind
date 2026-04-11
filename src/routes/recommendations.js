/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: Recommendations route — now returns 3 vibe-matched options in parallel.
 */
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const {
  getUserByCode,
  getRecentVisits,
  saveVisit,
  getDailyRecommendationCount,
  logRecommendation,
  DAILY_RECOMMENDATION_LIMIT,
} = require("../services/userService");
const { getRestaurantRecommendations } = require("../services/claudeService");
const {
  searchRestaurant,
  getUserCoordinates,
} = require("../services/mapsService");

// POST /api/v1/recommendations
router.post(
  "/",
  [
    body("user_code").trim().notEmpty().withMessage("user_code is required"),
    body("craving")
      .trim()
      .notEmpty()
      .withMessage("Tell us what you are craving!"),
    body("location").optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { user_code, craving, location, radius } = req.body;

      // 1. Fetch user + taste history
      const user = getUserByCode(user_code);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Check daily recommendation limit
      const dailyCount = getDailyRecommendationCount(user.id);
      if (dailyCount >= DAILY_RECOMMENDATION_LIMIT) {
        return res.status(429).json({
          error: `Daily recommendation limit reached (${DAILY_RECOMMENDATION_LIMIT}/day). Come back tomorrow!`,
          limit_reached: true,
        });
      }

      const recentVisits = getRecentVisits(user.id, 10);

      // 2. Claude returns a vibe + 3 search queries
      const claudeResponse = await getRestaurantRecommendations(
        user,
        recentVisits,
        craving,
        location,
      );

      // Log this recommendation against the user's daily count
      logRecommendation(user.id);

      // 3. Geocode once
      const locationStr = location || user.location;
      const coordinates = await getUserCoordinates(locationStr);
      console.log(`📍 Coordinates for "${locationStr}":`, coordinates);

      // 4. Run all 3 Places searches in parallel, grab top result from each
      const options = await Promise.all(
        claudeResponse.options.map(async (option) => {
          const places = await searchRestaurant(
            option.search_query,
            claudeResponse.price_range,
            radius || 10,
            coordinates,
          );
          // Take top 2 results per option
          return {
            label: option.label,
            places: places.slice(0, 2),
          };
        }),
      );

      // Filter out options where no places were found
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
    body("user_code").trim().notEmpty(),
    body("place_id").trim().notEmpty(),
    body("restaurant_name").trim().notEmpty(),
    body("cuisine_type").optional().trim(),
    body("price_level").optional().isInt({ min: 1, max: 4 }),
    body("address").optional().trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = getUserByCode(req.body.user_code);
      if (!user) return res.status(404).json({ error: "User not found" });

      const visit = saveVisit(user.id, req.body);
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
