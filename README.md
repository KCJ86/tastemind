# TasteMind 🍽️✦

> An AI-powered dining concierge that learns your taste, remembers every meal, and gets smarter with every recommendation.

**Live Demo:** [tastemind-production.up.railway.app](https://tastemind-production.up.railway.app)

---

## What is TasteMind?

TasteMind is a full-stack AI application that solves the daily "where should we eat?" problem in a personalized way. Instead of returning generic search results, TasteMind reads your mood and craving in natural language, analyzes your dining history, and uses Claude AI to identify a dining _vibe_ — then finds real restaurants nearby that match it.

The more you use it, the smarter it gets. Every review you write is embedded and stored, so when you ask for something new, TasteMind pulls up the past meals most relevant to _that_ craving — the good ones and the bad ones — and hands them to Claude. Rate a meal 4+ stars and your taste profile updates too.

---

## Features

- **Natural language cravings** — Describe what you want in plain English. "Something warm and comforting" or "I want to try something totally new tonight"
- **AI integrated vibe matching** — Claude identifies a dining vibe from your mood and history, not just a cuisine label
- **6 real recommendations** — 3 different takes on your vibe, 2 restaurants each, pulled live from Google Places
- **Review memory (RAG)** — Your reviews are searched by meaning, so a ramen craving surfaces your past ramen notes even if you wrote them months ago
- **Budget range** — Set a `$`–`$$$$` budget for each search, or leave it open
- **Taste profile** — Builds a picture of your liked cuisines from every highly rated meal
- **Pending feedback loop** — "I'm going here" saves a restaurant pending your review. After your meal, rate it and it gets saved to your history
- **Auto taste updates** — Rate something 4+ stars and your palate tags update automatically
- **Distance radius** — Slide from 1 to 50 miles to control how far you want to search
- **User codes** — No passwords. Get a unique code like `kennedy_cd64` to return to your profile anytime
- **Light / dark mode** — Follows your device by default, or pick one and it's remembered
- **Daily recommendation limit** — 20 recommendations per user per day to keep usage fair

---

## Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Backend  | Node.js + Express                             |
| AI       | Anthropic Claude (`claude-sonnet-5-5`)        |
| Embeds   | Voyage AI (`voyage-4-lite`, 1024 dims)        |
| Maps     | Google Places API (New) + Geocoding API       |
| Database | PostgreSQL + pgvector (Railway managed)       |
| Frontend | Vanilla HTML, CSS, JavaScript                 |
| Security | Helmet, express-rate-limit, input validation  |
| Hosting  | Railway                                       |

---

## How It Works

1. **You describe your craving** in natural language (plus an optional budget and radius)
2. **TasteMind retrieves relevant history** — your 3 most recent meals, plus the 5 past reviews most similar to this craving (see [RAG](#rag-review-memory))
3. **Claude reads your taste profile and that history** — liked/disliked cuisines, dietary restrictions, ratings, and notes
4. **Claude identifies a vibe** — e.g. "Warm & Comforting" or "Celebratory Elegance" — and writes 3 short search queries
5. **3 searches run in parallel** against Google Places, filtered by your budget and radius
6. **Top 2 results per query** are returned — up to 6 restaurants
7. **You pick one** → it goes into Pending Feedback
8. **After your meal**, you rate it + add notes
9. **TasteMind learns** — the review is embedded for future retrieval, and 4+ star ratings update your liked cuisines

---

## RAG (Review Memory)

Instead of dumping your whole history into the prompt, TasteMind retrieves the reviews that matter for what you're craving right now.

**Writing:** when you rate a visit, the text `"<cuisine>: <restaurant>. <your notes>"` is embedded with Voyage AI and upserted into a `review_embeddings` table (pgvector). One row per visit — re-rating overwrites it, so retrieval always reflects your latest opinion. The star rating is deliberately **not** embedded: a 1-star ramen review should still come up for a ramen craving, because "don't send me back there" is useful too. The rating is passed to Claude alongside the text instead.

**Reading:** your craving is embedded as a query, and the closest reviews (cosine similarity) are fetched — always scoped to your own account and to the current embedding model. Claude gets your 3 most recent meals plus up to 5 of these older, relevant reviews, and is told to lean toward what you rated highly and away from what you didn't.

**Fallbacks:** RAG never breaks a recommendation.

- If the database doesn't have pgvector, the app still boots and uses your last 10 visits instead
- If the embedding API fails during a search, that request falls back to your last 10 visits
- If embedding fails when you rate a meal, the rating is still saved — run `npm run backfill:embeddings` to catch up anything missed

The backfill script is also how you embed existing reviews after first enabling RAG or switching embedding models. It's safe to run repeatedly.

---

## Running Locally

### Prerequisites

- Node.js 18+
- A PostgreSQL database — [Railway](https://railway.app) offers a free managed instance. For RAG it needs the **pgvector** extension (optional — the app runs without it)
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com)
- A Google Maps API key with **Places API (New)** and **Geocoding API** enabled — [console.cloud.google.com](https://console.cloud.google.com)
- A Voyage AI API key for embeddings — [voyageai.com](https://www.voyageai.com) (optional — without it, recommendations use your recent visits only)

### Setup

```bash
# Clone the repo
git clone https://github.com/KCJ86/tastemind.git
cd tastemind

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

Open `.env` and fill in your keys:

```env
ANTHROPIC_API_KEY=your_anthropic_key_here
VOYAGE_API_KEY=your_voyage_key_here
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
DATABASE_URL=postgresql://postgres:password@host:port/railway
DATABASE_SSL=false
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
# CLAUDE_MODEL=claude-sonnet-5-5   # optional override
```

> **Tip:** If using Railway PostgreSQL, use the `DATABASE_PUBLIC_URL` from your PostgreSQL service variables as your local `DATABASE_URL` — it works from outside Railway's network. Set `DATABASE_SSL=true` when you do.

```bash
# Start the dev server
npm run dev
```

Visit `http://localhost:3000` — the app is ready. Tables are created automatically on startup; the console tells you whether RAG is enabled.

If you already have rated visits (or just turned on RAG), embed them once:

```bash
npm run backfill:embeddings
```

---

## Architecture

Browser
│
▼
Railway (Express + Node.js)
│
├──▶ Voyage AI (embeds reviews + cravings)
│
├──▶ Anthropic Claude API (vibe + search query generation)
│
├──▶ Google Places API (real restaurant results)
│
└──▶ PostgreSQL + pgvector (Railway) (users, visits, ratings, taste profiles, review embeddings)

## API Endpoints

POST /api/v1/users Create a new user
GET /api/v1/users/:code Get user + taste profile
PATCH /api/v1/users/:code/taste Update taste preferences
GET /api/v1/users/:code/visits Get visit history
POST /api/v1/users/:code/visits/:id/rate Rate a visit (also embeds the review)
PATCH /api/v1/users/:code/location Update saved location
POST /api/v1/recommendations Get AI recommendations
POST /api/v1/recommendations/save Save a visit

---

## Database Schema

users — name, user_code, location
taste_profiles — liked/disliked cuisines, price range, dietary restrictions, search radius
visits — restaurant visits tied to a user
ratings — star rating + notes per visit
review_embeddings — one vector per rated visit, for RAG (only created if pgvector is available)
recommendation_logs — daily usage tracking per user
reservations — reserved for future Stripe integration

---

## Project Structure

tastemind/
├── src/
│ ├── index.js # Express app + middleware
│ ├── db/
│ │ └── database.js # PostgreSQL pool + migrations
│ ├── routes/
│ │ ├── users.js # User CRUD + taste + ratings + location
│ │ └── recommendations.js # Claude + Places integration
│ └── services/
│ ├── claudeService.js # NL → structured recommendation
│ ├── embeddingService.js # Voyage AI embeddings
│ ├── retrievalService.js # RAG: index reviews + pick prompt context
│ ├── mapsService.js # Google Places + Geocoding
│ └── userService.js # DB queries
├── scripts/
│ └── backfill-embeddings.js # Embed any reviews missing a vector
├── public/
│ ├── index.html
│ ├── css/styles.css
│ └── js/
│ ├── theme.js # Light / dark / system theme
│ ├── api.js # All fetch calls
│ ├── ui.js # All DOM rendering
│ └── app.js # State + event handlers
├── .env.example
└── package.json

---

## Security

- **Helmet** for HTTP security headers
- **Rate limiting** — 100 requests / 15 min globally, 10 requests / min on the AI endpoint
- **Per-user daily limit** — 20 recommendations per user per day
- **Input validation** via `express-validator` on all routes
- **Parameterized queries** — no raw SQL string interpolation
- **Environment variables** — API keys never exposed to the client

---

## Author

**Kennedy Castillon Jimenez**

Built as a portfolio project demonstrating full-stack AI integration with Claude, real-time location APIs, PostgreSQL persistence, and a feedback-driven personalization loop.
Shoot me a message and let me know what would be dope to add! `:)`

---

_TasteMind — because "I don't know, what do you want?" is not a valid answer._
