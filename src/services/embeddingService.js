/**
 * Summary: Embedding service — turns text into vectors via Voyage AI.
 * Uses axios (already a dependency) instead of adding an SDK.
 */
const axios = require("axios");

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const EMBEDDING_MODEL = "voyage-4-lite";
const EMBEDDING_DIMS = 1024; // must match vector(1024) in database.js

// inputType is "document" for stored reviews and "query" for cravings.
// Voyage prepends a different instruction for each, which improves
// query→document matching compared to embedding both the same way.
const embed = async (texts, inputType) => {
  const response = await axios.post(
    VOYAGE_URL,
    {
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMS,
    },
    {
      headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
      timeout: 5000,
    },
  );
  // Sort by index so output order is guaranteed to match input order.
  return response.data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
};

const embedDocuments = (texts) => embed(texts, "document");
const embedQuery = async (text) => (await embed([text], "query"))[0];

// pgvector accepts vectors as a string literal like "[0.1,0.2,...]".
const toPgVector = (arr) => `[${arr.join(",")}]`;

module.exports = {
  embedDocuments,
  embedQuery,
  toPgVector,
  EMBEDDING_MODEL,
};
