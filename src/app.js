/**
 * Summary: Express app — middleware + routes. Exported without listening so
 * tests can drive it with supertest; src/index.js starts the real server.
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { checkOrigin } = require("./middleware/auth");

const app = express();

app.set("trust proxy", 1);

// ─── Security Middleware ───────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please slow down." },
});
app.use("/api/", limiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "AI recommendation limit reached, wait a moment." },
});
app.use("/api/v1/recommendations", aiLimiter);

// ─── General Middleware ────────────────────────────────
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use("/api/", checkOrigin);
app.use(express.static(path.join(__dirname, "../public")));

// ─── Routes ───────────────────────────────────────────
app.use("/api/v1/auth", require("./routes/auth"));
app.use("/api/v1/users", require("./routes/users"));
app.use("/api/v1/recommendations", require("./routes/recommendations"));

// ─── Global Error Handler ──────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : err.message,
  });
});

module.exports = app;
