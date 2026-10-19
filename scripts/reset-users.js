/**
 * Summary: One-off reset — deletes every user and everything tied to them
 * (taste profiles, visits, ratings, review embeddings, sessions,
 * recommendation logs, reservations). Never run on boot.
 *
 *   npm run db:reset-users              # shows what would be deleted
 *   npm run db:reset-users -- --confirm # deletes it
 *
 * It doesn't run migrations, and it doesn't restart id sequences: a reused
 * user id would inherit an old account's tm_pending_<id> list left in
 * someone's browser.
 */
require("dotenv").config({ quiet: true });
const { pool } = require("../src/db/database");

// Children first, so foreign keys never block a delete.
const TABLES = [
  "review_embeddings",
  "ratings",
  "visits",
  "taste_profiles",
  "sessions",
  "recommendation_logs",
  "reservations",
  "users",
];

const describeTarget = () => {
  const { hostname, port, pathname } = new URL(process.env.DATABASE_URL);
  return `${hostname}${port ? `:${port}` : ""}${pathname}`;
};

// review_embeddings only exists where pgvector is installed.
const existingTables = async () => {
  const { rows } = await pool.query(
    `SELECT t AS name FROM unnest($1::text[]) AS t WHERE to_regclass(t) IS NOT NULL`,
    [TABLES],
  );
  const present = new Set(rows.map((r) => r.name));
  return TABLES.filter((t) => present.has(t));
};

const countRows = async (tables) => {
  const counts = {};
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    counts[table] = rows[0].n;
  }
  return counts;
};

const printCounts = (counts) => {
  const width = Math.max(...Object.keys(counts).map((t) => t.length));
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(width)}  ${n}`);
  }
};

const main = async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const confirm = process.argv.includes("--confirm");

  console.log(`Database: ${describeTarget()}`);
  const tables = await existingTables();
  const before = await countRows(tables);
  console.log(confirm ? "Deleting:" : "Would delete:");
  printCounts(before);

  if (!confirm) {
    console.log("\nNothing deleted. Re-run with --confirm to delete these rows:");
    console.log("  npm run db:reset-users -- --confirm");
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of tables) await client.query(`DELETE FROM ${table}`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const after = await countRows(tables);
  const left = Object.values(after).reduce((a, b) => a + b, 0);
  if (left !== 0) throw new Error(`Rows remain after reset: ${JSON.stringify(after)}`);
  console.log("✅ All users and their data deleted.");
};

main()
  .catch((err) => {
    console.error("❌ Reset failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
