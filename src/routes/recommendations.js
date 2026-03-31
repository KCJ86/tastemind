/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: This is the recommendations route that will process the recommendation actionables!
 */

const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const {
  getUserByCode,
  getRecentVisits,
  saveVisit,
} = require("../services/userService");
const { getRestaurantRecommendations } = require("../services/claudeService");
const { searchRestaurant } = require("../services/mapsService");

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
      const { user_code, craving, location } = req.body;

      // 1. Fetch user + their taste history
      const user = getUserByCode(user_code);
      if (!user) return res.status(404).json({ error: "User not found" });

      const recentVisits = getRecentVisits(user.id, 10);

      // 2. Claude generates one focused recommendation
      const claudeResponse = await getRestaurantRecommendations(
        user,
        recentVisits,
        craving,
        location,
      );

      // 3. Hit Google Places once for that recommendation
      const places = await searchRestaurant(
        claudeResponse.search_query,
        claudeResponse.price_range,
      );

      res.json({
        success: true,
        summary: claudeResponse.summary,
        category: claudeResponse.category,
        reason: claudeResponse.reason,
        places,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not get recommendations" });
    }
  },
);

// POST /api/v1/recommendations/save — save a visit when user picks a restaurant
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
