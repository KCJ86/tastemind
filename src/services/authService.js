/**
 * Summary: Auth service — password hashing, sessions, and claiming legacy
 * user_code accounts.
 */
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { pool } = require("../db/database");
const { getUserById } = require("./userService");

// Tests set BCRYPT_ROUNDS low to stay fast; production always uses 12.
const BCRYPT_ROUNDS =
  process.env.NODE_ENV === "production"
    ? 12
    : parseInt(process.env.BCRYPT_ROUNDS || "12", 10);

const SESSION_COOKIE = "tm_session";
const SESSION_DAYS = 30;
const CLAIM_WINDOW_DAYS = 30;

// Compared against when the username doesn't exist, so a wrong username
// takes as long as a wrong password and the two can't be told apart.
const DUMMY_HASH = bcrypt.hashSync("tastemind-dummy-password", BCRYPT_ROUNDS);

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

// The cookie carries the raw token; the database only ever sees its hash.
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

// Returns the user if username + password match, otherwise null.
// Unclaimed legacy accounts have no password_hash and can never log in.
const verifyLogin = async (username, password) => {
  const result = await pool.query(
    `SELECT id, password_hash FROM users
     WHERE LOWER(username) = LOWER($1) AND password_hash IS NOT NULL`,
    [username],
  );
  const row = result.rows[0];
  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  return row && ok ? getUserById(row.id) : null;
};

const isUsernameTaken = async (username) => {
  const result = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return result.rowCount > 0;
};

const isEmailTaken = async (email) => {
  if (!email) return false;
  const result = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  return result.rowCount > 0;
};

const createAccount = async ({ name, username, password, location, email }) => {
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO users (name, username, password_hash, location, email)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, username, passwordHash, location, email || null],
    );
    const userId = userResult.rows[0].id;
    await client.query(`INSERT INTO taste_profiles (user_id) VALUES ($1)`, [
      userId,
    ]);
    await client.query("COMMIT");
    return getUserById(userId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// The window opens the first time the auth migration runs on a database
// (app_settings.claim_opens_at) and lasts CLAIM_WINDOW_DAYS.
const isClaimWindowOpen = async () => {
  const result = await pool.query(
    `SELECT value::timestamptz + make_interval(days => $1) > NOW() AS open
     FROM app_settings WHERE key = 'claim_opens_at'`,
    [CLAIM_WINDOW_DAYS],
  );
  return result.rows[0]?.open === true;
};

// Turns a legacy user_code account into a real one. A single UPDATE, so two
// simultaneous claims of the same code can't both succeed; user_code is
// cleared in the same statement so the code can never be used again.
// Returns the user, or null if the code is unknown or already claimed.
const claimAccount = async ({ userCode, username, password, email }) => {
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `UPDATE users
     SET username = $2, password_hash = $3, email = $4,
         claimed_at = NOW(), user_code = NULL
     WHERE user_code = $1 AND password_hash IS NULL
     RETURNING id`,
    [userCode, username, passwordHash, email || null],
  );
  return result.rows[0] ? getUserById(result.rows[0].id) : null;
};

// ─── Sessions ─────────────────────────────────────────
const createSession = async (userId) => {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + make_interval(days => $3))`,
    [hashToken(token), userId, SESSION_DAYS],
  );
  return token;
};

// Returns the session's user, or null if the token is unknown or expired.
const getSessionUser = async (token) => {
  if (!token) return null;
  const result = await pool.query(
    `UPDATE sessions SET last_used_at = NOW()
     WHERE token_hash = $1 AND expires_at > NOW()
     RETURNING user_id`,
    [hashToken(token)],
  );
  return result.rows[0] ? getUserById(result.rows[0].user_id) : null;
};

const deleteSession = async (token) => {
  if (!token) return;
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [
    hashToken(token),
  ]);
};

const deleteExpiredSessions = async () => {
  await pool.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
};

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
});

module.exports = {
  SESSION_COOKIE,
  CLAIM_WINDOW_DAYS,
  verifyLogin,
  isUsernameTaken,
  isEmailTaken,
  createAccount,
  isClaimWindowOpen,
  claimAccount,
  createSession,
  getSessionUser,
  deleteSession,
  deleteExpiredSessions,
  sessionCookieOptions,
};
