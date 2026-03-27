require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { initDb } = require("./db/database");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ───────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // we'll tighten this later
  }),
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Rate limiting — 100 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please slow down." },
});
app.use("/api/", limiter);

// Stricter limit on the AI endpoint specifically
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "AI recommendation limit reached, wait a moment." },
});
app.use("/api/v1/recommend", aiLimiter);

// ─── General Middleware ────────────────────────────────
app.use(morgan("dev")); // request logging
app.use(express.json()); // parse JSON bodies
app.use(express.static(path.join(__dirname, "../public"))); // serve frontend

// ─── Routes (we'll add these next) ────────────────────
app.use("/api/v1/users", require("./routes/users"));
app.use("/api/v1/recommend", require("./routes/recommend"));
// app.use('/api/v1/visits', require('./routes/visits'));
// app.use('/api/v1/reservations', require('./routes/reservations'));
// app.use('/api/v1/webhooks', require('./routes/webhooks'));

// ─── Global Error Handler ──────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack); // log full error server-side
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : err.message, // show details in dev only
  });
});

// ─── Start ────────────────────────────────────────────
initDb();
app.listen(PORT, () => {
  console.log(`🍽️  TasteMind running on http://localhost:${PORT}`);
});
