/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: User service — all DB queries, now using PostgreSQL
 */
const { pool } = require("../db/database");

// Never SELECT u.* for anything sent to the client — it would include
// password_hash. Add new user columns here deliberately.
const PUBLIC_USER_COLUMNS = `u.id, u.name, u.username, u.email,
            u.location, u.created_at`;

const getUserById = async (id) => {
  const result = await pool.query(
    `SELECT ${PUBLIC_USER_COLUMNS}, tp.liked_cuisines, tp.disliked_cuisines,
            tp.preferred_price_range, tp.dietary_restrictions
     FROM users u
     LEFT JOIN taste_profiles tp ON tp.user_id = u.id
     WHERE u.id = $1`,
    [id],
  );
  return result.rows[0] || null;
};

const updateTasteProfile = async (user_id, updates) => {
  const allowed = [
    "liked_cuisines",
    "disliked_cuisines",
    "preferred_price_range",
    "dietary_restrictions",
  ];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (fields.length === 0) return;

  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) =>
    Array.isArray(updates[f]) ? JSON.stringify(updates[f]) : updates[f],
  );

  await pool.query(
    `UPDATE taste_profiles
     SET ${setClause}, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $${fields.length + 1}`,
    [...values, user_id],
  );
};

const getRecentVisits = async (user_id, limit = 10) => {
  const result = await pool.query(
    `SELECT v.*, r.rating, r.notes
     FROM visits v
     -- latest rating only, so a re-rated visit doesn't appear twice
     LEFT JOIN LATERAL (
       SELECT rating, notes FROM ratings
       WHERE visit_id = v.id
       ORDER BY rated_at DESC, id DESC
       LIMIT 1
     ) r ON true
     WHERE v.user_id = $1
     ORDER BY v.visited_at DESC
     LIMIT $2`,
    [user_id, limit],
  );
  return result.rows;
};

const saveVisit = async (user_id, restaurant) => {
  const result = await pool.query(
    `INSERT INTO visits (user_id, place_id, restaurant_name, cuisine_type, price_level, address)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      user_id,
      restaurant.place_id,
      restaurant.restaurant_name,
      restaurant.cuisine_type || null,
      restaurant.price_level || null,
      restaurant.address || null,
    ],
  );
  return { id: result.rows[0].id };
};

// Only inserts if the visit belongs to this user. Returns false otherwise.
// Without this check, a review written by one user would be embedded into
// the visit owner's RAG context.
const saveRating = async (visit_id, user_id, rating, notes) => {
  const result = await pool.query(
    `INSERT INTO ratings (visit_id, user_id, rating, notes)
     SELECT $1::int, $2::int, $3::int, $4::text
     WHERE EXISTS (SELECT 1 FROM visits WHERE id = $1::int AND user_id = $2::int)`,
    [visit_id, user_id, rating, notes || null],
  );
  return result.rowCount > 0;
};

const DAILY_RECOMMENDATION_LIMIT = 20;

const getDailyRecommendationCount = async (user_id) => {
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM recommendation_logs
     WHERE user_id = $1
     AND created_at > NOW() - INTERVAL '1 day'`,
    [user_id],
  );
  return parseInt(result.rows[0].count);
};

const logRecommendation = async (user_id) => {
  await pool.query(`INSERT INTO recommendation_logs (user_id) VALUES ($1)`, [
    user_id,
  ]);
};

module.exports = {
  getUserById,
  updateTasteProfile,
  getRecentVisits,
  saveVisit,
  saveRating,
  getDailyRecommendationCount,
  logRecommendation,
  DAILY_RECOMMENDATION_LIMIT,
};
