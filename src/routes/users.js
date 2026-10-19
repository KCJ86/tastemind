/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: User routes — taste profile, visits, ratings, location.
 *   Every route acts on the signed-in user (req.user); there is no way to
 *   name another user. Accounts are created via /api/v1/auth.
 */
const express = require("express");
const router = express.Router();
const { body, param, validationResult } = require("express-validator");
const {
  updateTasteProfile,
  getRecentVisits,
  saveRating,
} = require("../services/userService");
const { pool, isRagEnabled } = require("../db/database");
const { indexReviews } = require("../services/retrievalService");
const {
  getUserCoordinates,
  getResolvedLocationName,
} = require("../services/mapsService");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

// PATCH /api/v1/users/me/taste
router.patch(
  "/me/taste",
  [body("liked_cuisines").optional().isArray()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      await updateTasteProfile(req.user.id, req.body);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not update taste profile" });
    }
  },
);

// GET /api/v1/users/me/visits
router.get("/me/visits", async (req, res) => {
  try {
    const visits = await getRecentVisits(req.user.id, 20);
    res.json({ success: true, visits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not get visits" });
  }
});

// POST /api/v1/users/me/visits/:id/rate
router.post(
  "/me/visits/:id/rate",
  [
    param("id").isInt({ min: 1 }).toInt(),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be 1-5"),
    body("notes").optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const visitId = req.params.id;
      // saveRating only inserts if the visit belongs to req.user, so a
      // visit id from someone else's account is just "not found".
      const saved = await saveRating(
        visitId,
        req.user.id,
        req.body.rating,
        req.body.notes,
      );
      if (!saved) return res.status(404).json({ error: "Visit not found" });

      // Embed the review so it's retrievable on future cravings. A failure
      // here must not fail the review the user just wrote — it's logged and
      // `npm run backfill:embeddings` picks up anything that was missed.
      if (isRagEnabled()) {
        try {
          await indexReviews([visitId]);
        } catch (err) {
          console.error(`Embedding failed for visit ${visitId}:`, err.message);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not save rating" });
    }
  },
);

// PATCH /api/v1/users/me/location
router.patch("/me/location", async (req, res) => {
  const { location } = req.body;
  if (typeof location !== "string" || !location.trim()) {
    return res.status(400).json({ error: "Location is required" });
  }
  try {
    const coordinates = await getUserCoordinates(location.trim());
    if (!coordinates) {
      return res.status(400).json({
        error:
          "Could not find that location. Try being more specific, e.g. 'Springfield, IL'",
        invalid: true,
      });
    }

    const resolvedName = await getResolvedLocationName(location.trim());
    await pool.query("UPDATE users SET location = $1 WHERE id = $2", [
      resolvedName || location.trim(),
      req.user.id,
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
