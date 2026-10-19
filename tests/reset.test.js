const { describe, test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const path = require("node:path");
const { pool, initDb, resetDb, send, signup } = require("./helpers");

const SCRIPT = path.join(__dirname, "../scripts/reset-users.js");
const USER_TABLES = [
  "users",
  "taste_profiles",
  "visits",
  "ratings",
  "review_embeddings",
  "sessions",
  "recommendation_logs",
  "reservations",
];

// helpers.js has already pointed DATABASE_URL at the test database; the
// child process inherits it, and dotenv never overrides an existing value.
const runReset = (...args) =>
  new Promise((resolve) => {
    execFile("node", [SCRIPT, ...args], { env: process.env }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr }),
    );
  });

const counts = async () => {
  const out = {};
  for (const table of USER_TABLES) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    out[table] = rows[0].n;
  }
  return out;
};

before(async () => {
  await initDb();
});
after(async () => {
  await pool.end();
});

describe("npm run db:reset-users", () => {
  beforeEach(async () => {
    await resetDb();
    // Two users with data in every table the reset should clear
    for (const username of ["alice", "bob"]) {
      const { user, cookie } = await signup({ username });
      const saved = await send("post", "/api/v1/recommendations/save", {
        cookie,
        body: { place_id: `p_${username}`, restaurant_name: `${username}'s spot`, cuisine_type: "Thai" },
      });
      await send("post", `/api/v1/users/me/visits/${saved.body.visit_id}/rate`, {
        cookie,
        body: { rating: 5, notes: "great" },
      });
      await pool.query("INSERT INTO recommendation_logs (user_id) VALUES ($1)", [user.id]);
      await pool.query(
        `INSERT INTO reservations (user_id, place_id, restaurant_name, customer_email, amount)
         VALUES ($1, 'p', 'r', 'a@example.com', 10)`,
        [user.id],
      );
    }
  });

  test("without --confirm, prints the counts and deletes nothing", async () => {
    const before = await counts();
    assert.ok(Object.values(before).every((n) => n > 0), JSON.stringify(before));

    const res = await runReset();
    assert.notEqual(res.code, 0);
    assert.match(res.stdout, /tastemind_test/);
    for (const [table, n] of Object.entries(before)) {
      assert.match(res.stdout, new RegExp(`${table}\\s+${n}\\b`), `count for ${table}`);
    }
    assert.match(res.stdout, /Nothing deleted/);
    assert.deepEqual(await counts(), before);
  });

  test("with --confirm, deletes every user and everything tied to them", async () => {
    const res = await runReset("--confirm");
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /All users and their data deleted/);
    const after = await counts();
    assert.ok(Object.values(after).every((n) => n === 0), JSON.stringify(after));
  });

  test("doesn't restart ids, so a new user never reuses an old user's id", async () => {
    const { rows } = await pool.query("SELECT max(id) AS max FROM users");
    await runReset("--confirm");
    const { user } = await signup({ username: "carol" });
    assert.ok(user.id > rows[0].max, `new id ${user.id} should be above ${rows[0].max}`);
  });
});
