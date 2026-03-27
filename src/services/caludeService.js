/**
 *
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: The main portion of our claude service to process and build the prompts for response.
 *
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const buildTasteContext = (user, recentVisits) => {
  const liked = JSON.parse(user.liked_cuisines || "[]");
  const disliked = JSON.parse(user.disliked_cuisines || "[]");
  const dietary = JSON.parse(user.dietary_restrictions || "[]");

  const visitHistory =
    recentVisits.length > 0
      ? recentVisits
          .map((v) => {
            const ratingStr = v.rating
              ? `rated ${v.rating}/5`
              : "not yet rated";
            const notesStr = v.notes ? ` — "${v.notes}"` : "";
            return `- ${v.restaurant_name} (${v.cuisine_type || "unknown cuisine"}, ${ratingStr}${notesStr})`;
          })
          .join("\n")
      : "No visit history yet — this is their first recommendation.";

  return { liked, disliked, dietary, visitHistory };
};

const getRestaurantRecommendations = async (
  user,
  recentVisits,
  craving,
  location,
) => {
  const { liked, disliked, dietary, visitHistory } = buildTasteContext(
    user,
    recentVisits,
  );

  const systemPrompt = `You are TasteMind, a personal AI dining concierge. 
Your job is to recommend restaurants based on a user's mood, taste history, and preferences.
You are thoughtful, personalized, and always explain WHY you're recommending each place.
Always respond with valid JSON only — no markdown, no preamble, no explanation outside the JSON.`;

  const userPrompt = `Here is everything you know about this user:

Name: ${user.name}
Location: ${location || user.location}
Preferred price range: ${user.preferred_price_range}
Liked cuisines: ${liked.length > 0 ? liked.join(", ") : "not set yet"}
Disliked cuisines: ${disliked.length > 0 ? disliked.join(", ") : "none"}
Dietary restrictions: ${dietary.length > 0 ? dietary.join(", ") : "none"}

Recent dining history:
${visitHistory}

Their craving right now: "${craving}"

Based on all of this, generate exactly 3 restaurant search queries for Google Places.
For each, provide a personalized reason WHY you're suggesting it based on their history and mood.

Respond ONLY with this JSON shape:
{
  "summary": "one sentence describing what you understood about their mood/craving",
  "recommendations": [
    {
      "search_query": "specific search term for Google Places e.g. 'cozy Italian trattoria San Diego'",
      "cuisine_type": "Italian",
      "reason": "personalized reason referencing their history e.g. you rated Italian highly last month and wanted something cozy",
      "price_range": "$$"
    }
  ]
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
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

module.exports = { getRestaurantRecommendations };
