/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 26th, 2026
 * Summary: Our user service where we either create, get or update
 */

const { db } = require("../db/database");
const crypto = require("crypto");

// Generate a simple unique user code like: "kennedy_cd64"
const generateUserCode = (name) => {
  const slug = name.toLowerCase().split(" ")[0];
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${slug}_${suffix}`;
};

const createUser = (name, location) => {
  const user_code = generateUserCode(name);

  const user = db
    .prepare(
      `
    INSERT INTO users (name, user_code, location)
    VALUES (?, ?, ?)
  `,
    )
    .run(name, user_code, location);

  db.prepare(
    `
    INSERT INTO taste_profiles (user_id)
    VALUES (?)
  `,
  ).run(user.lastInsertRowid);

  return getUserById(user.lastInsertRowid);
};

const getUserById = (id) => {
  return db
    .prepare(
      `
    SELECT u.*, tp.liked_cuisines, tp.disliked_cuisines,
           tp.preferred_price_range, tp.dietary_restrictions
    FROM users u
    LEFT JOIN taste_profiles tp ON tp.user_id = u.id
    WHERE u.id = ?
  `,
    )
    .get(id);
};

const getUserByCode = (user_code) => {
  return db
    .prepare(
      `
    SELECT u.*, tp.liked_cuisines, tp.disliked_cuisines,
           tp.preferred_price_range, tp.dietary_restrictions
    FROM users u
    LEFT JOIN taste_profiles tp ON tp.user_id = u.id
    WHERE u.user_code = ?
  `,
    )
    .get(user_code);
};

const updateTasteProfile = (user_id, updates) => {
  const allowed = [
    "liked_cuisines",
    "disliked_cuisines",
    "preferred_price_range",
    "dietary_restrictions",
  ];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));

  if (fields.length === 0) return;

  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => {
    return Array.isArray(updates[f]) ? JSON.stringify(updates[f]) : updates[f];
  });

  db.prepare(
    `
    UPDATE taste_profiles
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `,
  ).run(...values, user_id);
};

const getRecentVisits = (user_id, limit = 10) => {
  return db
    .prepare(
      `
    SELECT v.*, r.rating, r.notes
    FROM visits v
    LEFT JOIN ratings r ON r.visit_id = v.id
    WHERE v.user_id = ?
    ORDER BY v.visited_at DESC
    LIMIT ?
  `,
    )
    .all(user_id, limit);
};

const saveVisit = (user_id, restaurant) => {
  return db
    .prepare(
      `
    INSERT INTO visits (user_id, place_id, restaurant_name, cuisine_type, price_level, address)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      user_id,
      restaurant.place_id,
      restaurant.name,
      restaurant.cuisine_type || null,
      restaurant.price_level || null,
      restaurant.address || null,
    );
};

const saveRating = (visit_id, user_id, rating, notes) => {
  return db
    .prepare(
      `
    INSERT INTO ratings (visit_id, user_id, rating, notes)
    VALUES (?, ?, ?, ?)
  `,
    )
    .run(visit_id, user_id, rating, notes || null);
};

module.exports = {
  createUser,
  getUserById,
  getUserByCode,
  updateTasteProfile,
  getRecentVisits,
  saveVisit,
  saveRating,
};
