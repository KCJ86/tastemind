/**
 * Summary: Embeds every rated visit that doesn't have an up-to-date embedding.
 * Safe to run repeatedly — it only touches visits that are missing an
 * embedding or were embedded with a different model.
 *
 *   npm run backfill:embeddings
 */
require("dotenv").config();
const { pool, initDb, isRagEnabled } = require("../src/db/database");
const { indexReviews } = require("../src/services/retrievalService");
const { EMBEDDING_MODEL } = require("../src/services/embeddingService");

const BATCH_SIZE = 50;

const main = async () => {
  await initDb();
  if (!isRagEnabled()) {
    throw new Error("pgvector is not available on this database");
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT v.id
     FROM visits v
     JOIN ratings r ON r.visit_id = v.id
     LEFT JOIN review_embeddings e ON e.visit_id = v.id
     WHERE e.visit_id IS NULL OR e.model <> $1
     ORDER BY v.id`,
    [EMBEDDING_MODEL],
  );
  const ids = rows.map((r) => r.id);
  console.log(`Found ${ids.length} visit(s) to embed with ${EMBEDDING_MODEL}`);

  let done = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    done += await indexReviews(ids.slice(i, i + BATCH_SIZE));
    console.log(`  embedded ${done}/${ids.length}`);
  }
  console.log("✅ Backfill complete");
};

main()
  .catch((err) => {
    console.error("Backfill failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
