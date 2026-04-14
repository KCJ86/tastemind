# TasteMind 🍽️✦

> An AI-powered dining concierge that learns your taste, remembers every meal, and gets smarter with every recommendation.

**Live Demo:** [tastemind-production.up.railway.app](https://tastemind-production.up.railway.app)

---

## What is TasteMind?

TasteMind is a full-stack AI application that solves the daily "where should we eat?" problem in a personalized way. Instead of returning generic search results, TasteMind reads your mood and craving in natural language, analyzes your dining history, and uses Claude AI to identify a dining _vibe_ — then finds real restaurants nearby that match it.

The more you use it, the smarter it gets. Rate a meal 4+ stars and TasteMind automatically updates your taste profile. Every recommendation from that point on is shaped by what you actually loved.

---

## Features

- **Natural language cravings** — Describe what you want in plain English. "Something warm and comforting" or "I want to try something totally new tonight"
- **AI integrated vibe matching** — Claude identifies a dining vibe from your mood and history, not just a cuisine label
- **6 real recommendations** — 3 different takes on your vibe, 2 restaurants each, pulled live from Google Places
- **Taste profile** — Builds a picture of your liked cuisines from every highly rated meal
- **Pending feedback loop** — "I'm going here" saves a restaurant pending your review. After your meal, rate it and it gets saved to your history
- **Auto taste updates** — Rate something 4+ stars and your palate tags update automatically
- **Distance radius** — Slide from 1 to 50 miles to control how far you want to search
- **User codes** — No passwords. Get a unique code like `kennedy_cd64` to return to your profile anytime
- **Daily recommendation limit** — 10 recommendations per user per day to keep usage fair

---

## Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Backend  | Node.js + Express                             |
| AI       | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Maps     | Google Places API (New) + Geocoding API       |
| Database | PostgreSQL (Railway managed)                  |
| Frontend | Vanilla HTML, CSS, JavaScript                 |
| Security | Helmet, express-rate-limit, input validation  |
| Hosting  | Railway                                       |

---

## How It Works

1. **You describe your craving** in natural language
2. **Claude reads your taste history** — liked cuisines, past visits, ratings, and notes
3. **Claude identifies a vibe** — e.g. "Warm & Comforting" or "Celebratory Elegance"
4. **3 search queries run in parallel** against Google Places, each a different expression of that vibe
5. **Top 2 results per query** are returned — 6 restaurants total
6. **You pick one** → it goes into Pending Feedback
7. **After your meal**, you rate it + add notes
8. **TasteMind learns** — high ratings update your taste profile for future recommendations

---

## Running Locally

### Prerequisites

- Node.js 18+
- A PostgreSQL database — [Railway](https://railway.app) offers a free managed instance
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com)
- A Google Maps API key with **Places API (New)** and **Geocoding API** enabled — [console.cloud.google.com](https://console.cloud.google.com)

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
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
DATABASE_URL=postgresql://postgres:password@host:port/railway
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

> **Tip:** If using Railway PostgreSQL, use the `DATABASE_PUBLIC_URL` from your PostgreSQL service variables as your local `DATABASE_URL` — it works from outside Railway's network.

```bash
# Start the dev server
npm run dev
```

Visit `http://localhost:3000` — the app is ready.

---

## Architecture

Browser
│
▼
Railway (Express + Node.js)
│
├──▶ Anthropic Claude API (vibe + search query generation)
│
├──▶ Google Places API (real restaurant results)
│
└──▶ PostgreSQL (Railway) (users, visits, ratings, taste profiles)

## API Endpoints

POST /api/v1/users Create a new user
GET /api/v1/users/:code Get user + taste profile
PATCH /api/v1/users/:code/taste Update taste preferences
GET /api/v1/users/:code/visits Get visit history
POST /api/v1/users/:code/visits/:id/rate Rate a visit
POST /api/v1/recommendations Get AI recommendations
POST /api/v1/recommendations/save Save a visit

---

## Database Schema

users — name, user_code, location
taste_profiles — liked/disliked cuisines, price range, dietary restrictions
visits — restaurant visits tied to a user
ratings — star rating + notes per visit
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
│ ├── mapsService.js # Google Places + Geocoding
│ └── userService.js # DB queries
├── public/
│ ├── index.html
│ ├── css/styles.css
│ └── js/
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
