/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: Claude service — builds prompts and parses responses.
 */
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const formatVisit = (v) => {
  const ratingStr = v.rating ? `rated ${v.rating}/5` : "not yet rated";
  const notesStr = v.notes ? ` — "${v.notes}"` : "";
  return `- ${v.restaurant_name} (${v.cuisine_type || "unknown cuisine"}, ${ratingStr}${notesStr})`;
};

// visitContext comes from retrievalService.getVisitContext():
//   recent   — latest meals, in date order
//   relevant — older reviews retrieved by semantic similarity to the craving
const buildTasteContext = (user, visitContext) => {
  const liked = JSON.parse(user.liked_cuisines || "[]");
  const disliked = JSON.parse(user.disliked_cuisines || "[]");
  const dietary = JSON.parse(user.dietary_restrictions || "[]");
  const { recent, relevant } = visitContext;

  let visitHistory;
  if (recent.length === 0 && relevant.length === 0) {
    visitHistory = "No visit history yet — this is their first recommendation.";
  } else {
    visitHistory = `Most recent meals:\n${
      recent.length > 0 ? recent.map(formatVisit).join("\n") : "- none"
    }`;
    if (relevant.length > 0) {
      visitHistory += `\n\nPast reviews most relevant to this craving (use these to ground your reasoning — lean toward what they rated highly, steer away from what they rated poorly):\n${relevant
        .map(formatVisit)
        .join("\n")}`;
    }
  }

  return { liked, disliked, dietary, visitHistory };
};

const getRestaurantRecommendations = async (
  user,
  visitContext,
  craving,
  location,
  priceLevels = [],
) => {
  const budget =
    priceLevels.length > 0
      ? priceLevels.map((n) => "$".repeat(n)).join(", ")
      : "any — they did not set a budget for this search";

  const { liked, disliked, dietary, visitHistory } = buildTasteContext(
    user,
    visitContext,
  );

  const systemPrompt = `You are TasteMind, a personal AI dining concierge.
Your job is to recommend restaurants based on a user's mood, taste history, and preferences.
You think in vibes and experiences, not just cuisine labels.
Always respond with valid JSON only — no markdown, no preamble, no explanation outside the JSON.`;

  const userPrompt = `Here is everything you know about this user:

Name: ${user.name}
Location: ${location || user.location}
Budget for this search: ${budget}
Liked cuisines: ${liked.length > 0 ? liked.join(", ") : "not set yet"}
Disliked cuisines: ${disliked.length > 0 ? disliked.join(", ") : "none"}
Dietary restrictions: ${dietary.length > 0 ? dietary.join(", ") : "none"}

Dining history:
${visitHistory}

Their craving right now: "${craving}"

Based on all of this, identify ONE dining vibe or experience that best matches their craving and mood.
Then generate exactly 3 different restaurant options that each express that vibe differently —
different cuisines, different styles, or different takes on the same feeling.
Respect their budget exactly. If they didn't set one, don't assume or mention a price range.

CRITICAL search_query rules:
- Keep each search_query to 2-4 words MAX — short queries work best with Google Places
- Use only the cuisine type and 1-2 descriptors — nothing flowery or overly specific
- Good examples: "pho noodle soup", "ramen restaurant", "mexican pozole", "sushi omakase", "italian pasta"
- Bad examples: "artisan handcrafted slow-cooked heritage grain bread sandwich shop"
- Never include city names or locations in search_query

Respond ONLY with this JSON shape:
{
  "summary": "one sentence describing what you understood about their mood/craving",
  "vibe": "Short Vibe Name",
  "reason": "personalized reason referencing their history and why this vibe fits",
  "options": [
    {
      "label": "Vietnamese Pho",
      "search_query": "pho vietnamese"
    },
    {
      "label": "Japanese Ramen",
      "search_query": "ramen japanese"
    },
    {
      "label": "Mexican Pozole",
      "search_query": "pozole mexican"
    }
  ]
}`;

  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Claude returned malformed JSON");
  }
};

module.exports = { getRestaurantRecommendations, buildTasteContext };
