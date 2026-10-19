require("dotenv").config();

const app = require("./app");
const { initDb } = require("./db/database");
const { deleteExpiredSessions } = require("./services/authService");

const PORT = process.env.PORT || 3000;

// ─── Start ────────────────────────────────────────────
initDb()
  .then(async () => {
    await deleteExpiredSessions();
    setInterval(
      () => deleteExpiredSessions().catch((err) => console.error(err)),
      60 * 60 * 1000,
    ).unref();

    app.listen(PORT, () => {
      console.log(`🍽️  TasteMind running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
