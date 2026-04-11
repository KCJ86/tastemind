/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: User routes — CRUD, taste profile, ratings, location
 */
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const {
  createUser,
  getUserByCode,
  updateTasteProfile,
  getRecentVisits,
  saveRating,
} = require("../services/userService");
const { pool } = require("../db/database");
const {
  getUserCoordinates,
  getResolvedLocationName,
} = require("../services/mapsService");

// POST /api/v1/users
router.post(
  "/",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("location").trim().notEmpty().withMessage("Location is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const user = await createUser(req.body.name, req.body.location);
      res.status(201).json({ success: true, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not create user" });
    }
  },
);

// GET /api/v1/users/:code
router.get("/:code", async (req, res) => {
  try {
    const user = await getUserByCode(req.params.code);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not get user" });
  }
});

// PATCH /api/v1/users/:code/taste
router.patch(
  "/:code/taste",
  [body("liked_cuisines").optional().isArray()],
  async (req, res) => {
    try {
      const user = await getUserByCode(req.params.code);
      if (!user) return res.status(404).json({ error: "User not found" });
      await updateTasteProfile(user.id, req.body);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not update taste profile" });
    }
  },
);

// GET /api/v1/users/:code/visits
router.get("/:code/visits", async (req, res) => {
  try {
    const user = await getUserByCode(req.params.code);
    if (!user) return res.status(404).json({ error: "User not found" });
    const visits = await getRecentVisits(user.id, 20);
    res.json({ success: true, visits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not get visits" });
  }
});

// POST /api/v1/users/:code/visits/:id/rate
router.post(
  "/:code/visits/:id/rate",
  [
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be 1-5"),
    body("notes").optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const user = await getUserByCode(req.params.code);
      if (!user) return res.status(404).json({ error: "User not found" });
      await saveRating(
        parseInt(req.params.id),
        user.id,
        req.body.rating,
        req.body.notes,
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not save rating" });
    }
  },
);

// PATCH /api/v1/users/:code/location
router.patch("/:code/location", async (req, res) => {
  const { location } = req.body;
  if (!location || !location.trim()) {
    return res.status(400).json({ error: "Location is required" });
  }
  try {
    const user = await getUserByCode(req.params.code);
    if (!user) return res.status(404).json({ error: "User not found" });

    const coordinates = await getUserCoordinates(location.trim());
    if (!coordinates) {
      return res.status(400).json({
        error:
          "Could not find that location. Try being more specific, e.g. 'Springfield, IL'",
        invalid: true,
      });
    }

    const resolvedName = await getResolvedLocationName(location.trim());
    await pool.query("UPDATE users SET location = $1 WHERE user_code = $2", [
      resolvedName || location.trim(),
      req.params.code,
    ]);

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
