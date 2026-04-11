const Database = require("better-sqlite3");
const path = require("path");

// Creates tastemind.db in the project root if it doesn't exist
const db = new Database(path.join(__dirname, "../../tastemind.db"));

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const initDb = () => {
  db.exec(`
    -- Users table (simple for now, email+password later)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      user_code TEXT UNIQUE NOT NULL,  -- simple shareable ID e.g. "kennedy_123"
      location TEXT,                   -- default city for searches
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Taste profile :) what Claude uses to personalize recommendations
    CREATE TABLE IF NOT EXISTS taste_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      liked_cuisines TEXT DEFAULT '[]',
      disliked_cuisines TEXT DEFAULT '[]',
      preferred_price_range TEXT DEFAULT '$$',
      dietary_restrictions TEXT DEFAULT '[]',
      search_radius INTEGER DEFAULT 10,        -- radius in miles, default 10
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Every restaurant Claude has recommended + user visited
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      place_id TEXT NOT NULL,       -- Google Place ID
      restaurant_name TEXT NOT NULL,
      cuisine_type TEXT,
      price_level INTEGER,          -- 1-4
      address TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Ratings after the meal
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      notes TEXT,                   -- "loved the pasta, a bit loud though"
      rated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visit_id) REFERENCES visits(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Reservations tied to Stripe (later to do as scaling)
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      place_id TEXT NOT NULL,
      restaurant_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      party_size INTEGER,
      reservation_date TEXT,
      amount REAL NOT NULL,
      stripe_session_id TEXT UNIQUE,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- User limitation table 
    CREATE TABLE IF NOT EXISTS recommendation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
      );
  `);
  // Migrations — safely add new columns if they don't exist
  const cols = db.pragma("table_info(taste_profiles)").map((c) => c.name);
  if (!cols.includes("search_radius")) {
    db.exec(
      "ALTER TABLE taste_profiles ADD COLUMN search_radius INTEGER DEFAULT 10",
    );
    console.log("✅ Migrated: added search_radius");
  }
  console.log("✅ Database initialized");
};

module.exports = { db, initDb };
