/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: PostgreSQL database setup + migrations
 */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        user_code TEXT UNIQUE NOT NULL,
        location TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS taste_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        liked_cuisines TEXT DEFAULT '[]',
        disliked_cuisines TEXT DEFAULT '[]',
        preferred_price_range TEXT DEFAULT '$$',
        dietary_restrictions TEXT DEFAULT '[]',
        search_radius INTEGER DEFAULT 10,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS visits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        place_id TEXT NOT NULL,
        restaurant_name TEXT NOT NULL,
        cuisine_type TEXT,
        price_level INTEGER,
        address TEXT,
        visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        visit_id INTEGER NOT NULL REFERENCES visits(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        notes TEXT,
        rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS recommendation_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        place_id TEXT NOT NULL,
        restaurant_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        party_size INTEGER,
        reservation_date TEXT,
        amount REAL NOT NULL,
        stripe_session_id TEXT UNIQUE,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database initialized");
  } finally {
    client.release();
  }

  await initRag();
};

// ─── RAG (pgvector) ────────────────────────────────────
// Kept separate from the core tables on purpose: if the database doesn't
// have pgvector installed, the app still boots and recommendations fall
// back to the old "last 10 visits" behavior instead of crashing.
let ragEnabled = false;

const initRag = async () => {
  try {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;

      -- One embedding per visit. Re-rating a visit overwrites its row (upsert),
      -- so retrieval always reflects the user's latest opinion.
      CREATE TABLE IF NOT EXISTS review_embeddings (
        visit_id INTEGER PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,            -- exact text that was embedded
        embedding vector(1024) NOT NULL,
        model TEXT NOT NULL,              -- vectors from different models aren't comparable
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Every retrieval is scoped to one user, so this filter does the heavy
      -- lifting. With tens of reviews per user, an exact scan over that user's
      -- rows is fast; an approximate (HNSW) index isn't needed yet.
      CREATE INDEX IF NOT EXISTS idx_review_embeddings_user
        ON review_embeddings(user_id);
    `);
    ragEnabled = true;
    console.log("✅ RAG enabled (pgvector)");
  } catch (err) {
    console.warn(
      "⚠️  RAG disabled — pgvector unavailable, using recency fallback:",
      err.message,
    );
  }
};

const isRagEnabled = () => ragEnabled;

module.exports = { pool, initDb, isRagEnabled };
