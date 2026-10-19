/**
 * Summary: Auth routes — signup, login, logout, and the current session's user.
 */
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const {
  SESSION_COOKIE,
  verifyLogin,
  isUsernameTaken,
  isEmailTaken,
  createAccount,
  createSession,
  deleteSession,
  sessionCookieOptions,
} = require("../services/authService");
const { requireAuth } = require("../middleware/auth");

const INVALID_LOGIN = "Invalid username or password";

// ─── Rate limits ──────────────────────────────────────
// In-memory, so they reset on deploy and assume a single instance.
const limit = (windowMinutes, max, message, extra = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    ...extra,
  });

const TOO_MANY_LOGINS = "Too many sign-in attempts. Try again in 15 minutes.";

// Per IP, and per username so one account can't be guessed at from many IPs.
const loginIpLimiter = limit(15, 10, TOO_MANY_LOGINS, {
  skipSuccessfulRequests: true,
});
const loginUserLimiter = limit(15, 5, TOO_MANY_LOGINS, {
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `user:${String(req.body?.username || "").trim().toLowerCase()}`,
});

const signupLimiter = limit(60, 5, "Too many accounts created. Try again later.");

// ─── Validation ───────────────────────────────────────
const usernameRule = body("username")
  .isString()
  .trim()
  .toLowerCase()
  .matches(/^[a-z0-9_.]{3,30}$/)
  .withMessage(
    "Username must be 3-30 characters: letters, numbers, underscores, or dots",
  );

// bcrypt ignores everything past 72 bytes, so longer passwords are rejected
// rather than silently truncated.
const newPasswordRule = body("password")
  .isString()
  .custom((pw) => pw.length >= 10 && Buffer.byteLength(pw, "utf8") <= 72)
  .withMessage("Password must be at least 10 characters (and at most 72 bytes)");

const emailRule = body("email")
  .optional({ values: "falsy" })
  .trim()
  .isEmail()
  .withMessage("That doesn't look like an email address")
  .toLowerCase();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// Checked before inserting so the response names the field that's taken.
const checkAvailability = async (req, res, next) => {
  try {
    if (await isUsernameTaken(req.body.username)) {
      return res.status(409).json({ error: "That username is taken" });
    }
    if (await isEmailTaken(req.body.email)) {
      return res.status(409).json({ error: "That email is already in use" });
    }
    next();
  } catch (err) {
    next(err);
  }
};

const isUniqueViolation = (err) => err.code === "23505";

const startSession = async (res, userId) => {
  const token = await createSession(userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
};

// POST /api/v1/auth/signup
router.post(
  "/signup",
  signupLimiter,
  [
    body("name").isString().trim().notEmpty().isLength({ max: 60 }).withMessage("Name is required"),
    usernameRule,
    newPasswordRule,
    body("location").isString().trim().notEmpty().withMessage("Location is required"),
    emailRule,
  ],
  validate,
  checkAvailability,
  async (req, res) => {
    try {
      const user = await createAccount(req.body);
      await startSession(res, user.id);
      res.status(201).json({ success: true, user });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "That username or email is taken" });
      }
      console.error(err);
      res.status(500).json({ error: "Could not create account" });
    }
  },
);

// POST /api/v1/auth/login
router.post(
  "/login",
  loginIpLimiter,
  loginUserLimiter,
  [
    body("username").isString().trim().notEmpty(),
    body("password").isString().notEmpty(),
  ],
  validate,
  async (req, res) => {
    try {
      const user = await verifyLogin(req.body.username, req.body.password);
      if (!user) return res.status(401).json({ error: INVALID_LOGIN });
      await startSession(res, user.id);
      res.json({ success: true, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not sign in" });
    }
  },
);

// POST /api/v1/auth/logout
router.post("/logout", async (req, res) => {
  try {
    await deleteSession(req.cookies[SESSION_COOKIE]);
    const { maxAge, ...cookieOptions } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not sign out" });
  }
});

// GET /api/v1/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
