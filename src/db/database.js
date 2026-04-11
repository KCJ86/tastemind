/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: PostgreSQL database setup + migrations
 */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
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
};

module.exports = { pool, initDb };
