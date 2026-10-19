# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev                  # nodemon src/index.js — serves API + static frontend on http://localhost:3000
npm start                    # production start (Railway)
npm run backfill:embeddings  # embed any rated visits missing an up-to-date embedding (idempotent)
```

### Local database

Local Postgres 18 + pgvector runs from the conda env `tastemind-pg` (Homebrew is broken on this Mac), with data in `~/pgdata/tastemind` (outside the repo) on **port 5433**. It must be running before `npm run dev` or tests.

```bash
conda run -n tastemind-pg pg_ctl -D ~/pgdata/tastemind -l ~/pgdata/tastemind.log start
conda run -n tastemind-pg pg_ctl -D ~/pgdata/tastemind stop
conda run -n tastemind-pg pg_ctl -D ~/pgdata/tastemind status
conda run -n tastemind-pg psql -h ~/pgdata/tastemind -p 5433 -U postgres -d tastemind_dev   # superuser shell (socket, no password)
```

Databases: `tastemind_dev` (`DATABASE_URL`, restored from a production backup, so it holds real user data) and `tastemind_test` (`TEST_DATABASE_URL`, wiped by tests). Both are owned by the non-superuser role `tastemind`; the `vector` extension was pre-created by `postgres` because `tastemind` can't create it. The `.env` file has no Railway URLs. Never point `DATABASE_URL` or `TEST_DATABASE_URL` at Railway when running locally.

There is no linter or build step. The frontend is plain static files served by Express, so frontend edits need only a browser refresh.

Required env (see `.env.example`): `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY` (Places API (New) + Geocoding), `DATABASE_URL` (PostgreSQL). Optional: `VOYAGE_API_KEY` (embeddings for RAG), `CLAUDE_MODEL` (overrides the default in `claudeService.js`), `DATABASE_SSL=true` (needed for Railway's public URL), `FRONTEND_URL` (CORS origin).

The app is PostgreSQL-only; it was SQLite earlier, and SQLite files (`*.db`, `*.db-wal`, `*.db-shm`) are gitignored because the old ones held real user data. One leftover from that migration: `saveVisit` still returns `{ lastInsertRowid }`.

## Architecture

Express 5 backend (`src/`) plus a vanilla JS frontend (`public/`) in one Railway service. Every API route is under `/api/v1`.

**Schema and migrations**: `src/db/database.js` `initDb()` runs `CREATE TABLE IF NOT EXISTS` at boot. There is no migration tool, so schema changes go here and must be safe to re-run. JSON-ish profile fields (`liked_cuisines`, `disliked_cuisines`, `dietary_restrictions`) are stored as **TEXT containing JSON** and `JSON.parse`d by readers on both backend and frontend. The `reservations` table and the `stripe` dependency are placeholders for a future feature.

**Recommendation flow** (`src/routes/recommendations.js` `POST /`):
1. Check the per-user daily limit (`DAILY_RECOMMENDATION_LIMIT` in `userService.js`, a rolling 24h count from `recommendation_logs`). This is separate from the express-rate-limit limiters in `src/index.js`.
2. `retrievalService.getVisitContext()` picks which visit history goes into the prompt (see RAG below).
3. `claudeService.getRestaurantRecommendations()` asks Claude for **JSON only**: `{summary, vibe, reason, options[3]{label, search_query}}`. The response is parsed with `JSON.parse` directly, so prompt changes must keep that output contract. `search_query` is deliberately kept to 2–4 words with no location, because that works best with Google Places.
4. `mapsService` geocodes the location and runs the 3 Places text searches in parallel, filtered by `price_levels` (budget, 1–4) and radius. It keeps the top 2 results per option and drops options that have no results.

**RAG** (`retrievalService.js`, `embeddingService.js`): rated visits are embedded with Voyage (`voyage-4-lite`, 1024 dims) into the pgvector table `review_embeddings`, one row per visit, upserted when a visit is re-rated. Retrieval returns the 3 most recent visits plus the top 5 semantically similar older reviews, always scoped to one user and filtered by `model`. Key invariants:
- RAG must degrade gracefully. If pgvector is missing, `isRagEnabled()` is false and the app falls back to the last 10 visits. If the embedding call fails, it also falls back. The rating route catches indexing errors so a review is never lost. Keep this behavior.
- The star rating is intentionally **not** embedded, only cuisine, name, and notes. The rating is passed to Claude as metadata instead.
- If you change `EMBEDDING_MODEL` or the dimensions, update `vector(1024)` in `database.js` and run the backfill.

**Ownership**: users are identified only by `user_code` (no passwords or auth). Every route resolves `user_code` → `user.id`, and queries must scope by `user_id`. For example, `saveRating` checks that the visit belongs to the user.

**Taste profile updates happen client-side**: after a rating of 4 or more, `public/js/app.js` `autoUpdateTaste()` recomputes `liked_cuisines` from history and PATCHes `/users/:code/taste`. The server does not do this.

**Frontend**: no framework or bundler. Scripts are loaded as globals in this order: `theme.js` (in `<head>`, to avoid a flash of the wrong theme), then `api.js` (all fetch calls), `ui.js` (DOM rendering), and `app.js` (state and event handlers). The user code, theme, and budget are kept in `localStorage`. Dark mode uses `data-theme` on the root element plus `prefers-color-scheme`.
