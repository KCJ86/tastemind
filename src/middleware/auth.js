/**
 * Summary: Auth middleware — session lookup and CSRF origin check.
 */
const { SESSION_COOKIE, getSessionUser } = require("../services/authService");

// Sets req.user from the session cookie, or responds 401.
const requireAuth = async (req, res, next) => {
  try {
    const user = await getSessionUser(req.cookies[SESSION_COOKIE]);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// Session cookies are sent automatically, so another site could submit
// requests on a signed-in user's behalf (CSRF). SameSite=Lax blocks most of
// that; this blocks the rest by rejecting state-changing requests whose
// Origin isn't this app. Requests without an Origin header (curl, server
// code) aren't from a browser page, so they can't carry a forged session.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const checkOrigin = (req, res, next) => {
  const origin = req.get("Origin");
  if (SAFE_METHODS.has(req.method) || !origin) return next();

  const allowed = [
    `${req.protocol}://${req.get("Host")}`,
    process.env.FRONTEND_URL,
  ].filter(Boolean);
  if (allowed.includes(origin)) return next();

  res.status(403).json({ error: "Cross-site request blocked" });
};

module.exports = { requireAuth, checkOrigin };
