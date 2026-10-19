/**
 * Summary: Test setup. Must be required before anything from src/, because
 * src/db/database.js reads DATABASE_URL when it's first loaded.
 */
require("dotenv").config({ quiet: true });

// Tests wipe every table, so refuse to run against anything that isn't
// clearly a local throwaway database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is not set — refusing to run tests");
}
const { hostname, pathname } = new URL(testUrl);
if (!["localhost", "127.0.0.1"].includes(hostname) || !pathname.endsWith("_test")) {
  throw new Error(
    `TEST_DATABASE_URL must be a local database ending in _test (got ${hostname}${pathname})`,
  );
}
process.env.DATABASE_URL = testUrl;
process.env.DATABASE_SSL = "false";
process.env.NODE_ENV = "test";
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || "4";

const request = require("supertest");
const app = require("../src/app");
const { pool, initDb } = require("../src/db/database");

const resetDb = async () => {
  await pool.query(`
    TRUNCATE users, taste_profiles, visits, ratings, recommendation_logs,
             reservations, sessions
      RESTART IDENTITY CASCADE;
    UPDATE app_settings SET value = NOW()::text WHERE key = 'claim_opens_at';
  `);
};

// Rate limiters key on req.ip, which comes from X-Forwarded-For because of
// `trust proxy`. A fresh IP per request keeps tests from tripping each
// other's limits; rate-limit tests reuse one IP on purpose.
let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

const post = (path, body, ip = nextIp()) =>
  request(app).post(path).set("X-Forwarded-For", ip).send(body);

const get = (path, cookie) => {
  const req = request(app).get(path).set("X-Forwarded-For", nextIp());
  return cookie ? req.set("Cookie", cookie) : req;
};

// "tm_session=<token>" from a response, for sending back as a Cookie header.
const sessionCookie = (res) => {
  const raw = (res.headers["set-cookie"] || []).find((c) =>
    c.startsWith("tm_session="),
  );
  return raw ? raw.split(";")[0] : null;
};

const PASSWORD = "correct horse battery";

const signup = async (overrides = {}) => {
  const res = await post("/api/v1/auth/signup", {
    name: "Test User",
    username: "tester",
    password: PASSWORD,
    location: "San Diego, CA",
    ...overrides,
  });
  if (res.status !== 201) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { user: res.body.user, cookie: sessionCookie(res) };
};

// A pre-accounts user: has a user_code, no username or password.
const createLegacyUser = async (userCode, name = "Legacy") => {
  const result = await pool.query(
    `INSERT INTO users (name, user_code, location) VALUES ($1, $2, 'San Diego, CA')
     RETURNING id`,
    [name, userCode],
  );
  const id = result.rows[0].id;
  await pool.query(`INSERT INTO taste_profiles (user_id) VALUES ($1)`, [id]);
  return id;
};

module.exports = {
  app,
  pool,
  initDb,
  resetDb,
  nextIp,
  post,
  get,
  sessionCookie,
  signup,
  createLegacyUser,
  PASSWORD,
};
