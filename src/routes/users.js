/**
 *  Author: Kennedy Castillon Jimenez
 *  Date: March 28th, 2026
 *  Summary: The user route to allow for us to see what will be the methods for actionables pertaining to the user.
 */

const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const {
  getUserCoordinates,
  getResolvedLocationName,
} = require("../services/mapsService");
const {
  createUser,
  getUserByCode,
  updateTasteProfile,
  getRecentVisits,
  saveRating,
} = require("../services/userService");
const { db } = require("../db/database");

// POST /api/v1/users — create a new user
router.post(
  "/",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("location").trim().notEmpty().withMessage("Location is required"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = createUser(req.body.name, req.body.location);
      res.status(201).json({ success: true, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not create user" });
    }
  },
);

// GET /api/v1/users/:user_code — fetch a user + their taste profile
router.get("/:user_code", (req, res) => {
  try {
    const user = getUserByCode(req.params.user_code);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch user" });
  }
});

// PATCH /api/v1/users/:user_code/taste — update taste preferences
router.patch(
  "/:user_code/taste",
  [
    body("liked_cuisines").optional().isArray(),
    body("disliked_cuisines").optional().isArray(),
    body("dietary_restrictions").optional().isArray(),
    body("preferred_price_range").optional().isIn(["$", "$$", "$$$", "$$$$"]),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = getUserByCode(req.params.user_code);
      if (!user) return res.status(404).json({ error: "User not found" });

      updateTasteProfile(user.id, req.body);
      res.json({ success: true, message: "Taste profile updated" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not update taste profile" });
    }
  },
);

// GET /api/v1/users/:user_code/visits — get recent visit history
router.get("/:user_code/visits", (req, res) => {
  try {
    const user = getUserByCode(req.params.user_code);
    if (!user) return res.status(404).json({ error: "User not found" });

    const visits = getRecentVisits(user.id);
    res.json({ success: true, visits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch visits" });
  }
});

// POST /api/v1/users/:user_code/visits/:visit_id/rate — rate a meal
router.post(
  "/:user_code/visits/:visit_id/rate",
  [
    body("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("notes").optional().trim().isLength({ max: 500 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = getUserByCode(req.params.user_code);
      if (!user) return res.status(404).json({ error: "User not found" });

      saveRating(req.params.visit_id, user.id, req.body.rating, req.body.notes);

      res.json({
        success: true,
        message:
          "Rating saved! This will improve your future recommendations 🍽️",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not save rating" });
    }
  },
);

// PATCH /api/v1/users/:code/location — validate + save location
router.patch("/:code/location", async (req, res) => {
  const { location } = req.body;
  if (!location || !location.trim()) {
    return res.status(400).json({ error: "Location is required" });
  }

  try {
    const user = getUserByCode(req.params.code);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Validate against Google Geocoding
    const coordinates = await getUserCoordinates(location.trim());
    if (!coordinates) {
      return res.status(400).json({
        error:
          "Could not find that location. Try being more specific, e.g. 'Springfield, IL'",
        invalid: true,
      });
    }

    // Get the resolved display name from geocoding
    const resolvedName = await getResolvedLocationName(location.trim());

    // Save to DB
    db.prepare("UPDATE users SET location = ? WHERE user_code = ?").run(
      resolvedName || location.trim(),
      req.params.code,
    );

    res.json({
      success: true,
      location: resolvedName || location.trim(),
      coordinates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update location" });
  }
});

module.exports = router;
