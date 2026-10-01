/**
 * Summary: Retrieval service — the "R" in RAG.
 *   Write path: indexReviews() embeds rated visits into review_embeddings.
 *   Read path:  getVisitContext() picks which past reviews go into the prompt.
 */
const { pool, isRagEnabled } = require("../db/database");
const embeddings = require("./embeddingService");
const { getRecentVisits } = require("./userService");

const RECENT_N = 3; // always include the latest meals (variety / "had this yesterday")
const RELEVANT_K = 5; // plus the most semantically relevant older reviews
const FALLBACK_N = 10; // original behavior when RAG is off or fails

// What gets embedded: what the meal WAS (cuisine, place, the user's words).
// The star rating is deliberately left out of the vector and passed to Claude
// as metadata instead — a 1-star ramen review should still be retrieved for a
// ramen craving, because "don't send me back there" is useful context too.
const buildReviewDocument = (v) =>
  [
    `${v.cuisine_type || "Restaurant"}: ${v.restaurant_name}.`,
    v.notes || "",
  ]
    .join(" ")
    .trim();

// Embeds and upserts a batch of rated visits. Used by the rating route
// (one visit) and the backfill script (many).
const indexReviews = async (visitIds) => {
  if (visitIds.length === 0) return 0;

  // Latest rating per visit (a visit can be re-rated from history).
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (v.id)
            v.id, v.user_id, v.restaurant_name, v.cuisine_type, r.notes
     FROM visits v
     JOIN ratings r ON r.visit_id = v.id
     WHERE v.id = ANY($1::int[])
     ORDER BY v.id, r.rated_at DESC, r.id DESC`,
    [visitIds],
  );
  if (rows.length === 0) return 0;

  const contents = rows.map(buildReviewDocument);
  const vectors = await embeddings.embedDocuments(contents);

  for (let i = 0; i < rows.length; i++) {
    await pool.query(
      `INSERT INTO review_embeddings (visit_id, user_id, content, embedding, model)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (visit_id) DO UPDATE
         SET content = EXCLUDED.content,
             embedding = EXCLUDED.embedding,
             model = EXCLUDED.model,
             created_at = CURRENT_TIMESTAMP`,
      [
        rows[i].id,
        rows[i].user_id,
        contents[i],
        embeddings.toPgVector(vectors[i]),
        embeddings.EMBEDDING_MODEL,
      ],
    );
  }
  return rows.length;
};

// Top-k nearest reviews for one user. `<=>` is pgvector's cosine distance
// operator; similarity = 1 - distance. Filtering on model means vectors from
// an old embedding model are never compared against a new query vector.
const findSimilarReviews = async (userId, queryVector, k) => {
  const { rows } = await pool.query(
    `SELECT v.id, v.restaurant_name, v.cuisine_type, v.visited_at,
            r.rating, r.notes,
            1 - (e.embedding <=> $2::vector) AS similarity
     FROM review_embeddings e
     JOIN visits v ON v.id = e.visit_id
     JOIN LATERAL (
       SELECT rating, notes FROM ratings
       WHERE visit_id = v.id
       ORDER BY rated_at DESC, id DESC
       LIMIT 1
     ) r ON true
     WHERE e.user_id = $1 AND e.model = $3
     ORDER BY e.embedding <=> $2::vector
     LIMIT $4`,
    [userId, embeddings.toPgVector(queryVector), embeddings.EMBEDDING_MODEL, k],
  );
  return rows;
};

// Decides what visit history goes into the Claude prompt.
// Returns { recent, relevant, mode } — mode is logged so you can see in
// production which path each request took.
const getVisitContext = async (userId, craving) => {
  if (!isRagEnabled()) {
    return {
      recent: await getRecentVisits(userId, FALLBACK_N),
      relevant: [],
      mode: "recency",
    };
  }

  try {
    const [recent, queryVector] = await Promise.all([
      getRecentVisits(userId, RECENT_N),
      embeddings.embedQuery(craving),
    ]);

    // Over-fetch by RECENT_N so that after removing duplicates of the recent
    // visits we still have up to RELEVANT_K distinct older reviews.
    const similar = await findSimilarReviews(
      userId,
      queryVector,
      RELEVANT_K + RECENT_N,
    );
    const recentIds = new Set(recent.map((v) => v.id));
    const relevant = similar
      .filter((v) => !recentIds.has(v.id))
      .slice(0, RELEVANT_K);

    return { recent, relevant, mode: "rag" };
  } catch (err) {
    // Embedding API down / timeout → degrade to old behavior, never fail the request.
    console.error("RAG retrieval failed, using recency fallback:", err.message);
    return {
      recent: await getRecentVisits(userId, FALLBACK_N),
      relevant: [],
      mode: "recency-fallback",
    };
  }
};

module.exports = {
  buildReviewDocument,
  indexReviews,
  findSimilarReviews,
  getVisitContext,
  RECENT_N,
  RELEVANT_K,
};
