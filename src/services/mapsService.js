/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: Service for google maps with the place and search to be able to return restaraunts!
 */

const axios = require("axios");

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

const PRICE_MAP = { $: 1, $$: 2, $$$: 3, $$$$: 4 };

const searchRestaurant = async (query, priceRange) => {
  console.log(
    "🔑 Key loaded:",
    process.env.GOOGLE_MAPS_API_KEY ? "YES" : "MISSING",
  );

  try {
    const response = await axios.post(
      PLACES_URL,
      {
        textQuery: query,
        includedType: "restaurant",
        maxResultCount: 3,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours,places.location",
        },
      },
    );

    console.log(
      "🗺️ Google Places raw response:",
      JSON.stringify(response.data, null, 2),
    );

    const results = response.data.places || [];

    return results.map((p) => ({
      place_id: p.id,
      name: p.displayName?.text,
      address: p.formattedAddress,
      rating: p.rating,
      total_ratings: p.userRatingCount,
      price_level: p.priceLevel,
      open_now: p.regularOpeningHours?.openNow,
      location: p.location,
    }));
  } catch (err) {
    console.error("🗺️ Maps error:", err.response?.data || err.message);
    return [];
  }
};

const getRestaurantDetails = async (place_id) => {
  const { data } = await axios.get(DETAILS_URL, {
    params: {
      place_id,
      key: process.env.GOOGLE_MAPS_API_KEY,
      fields:
        "name,formatted_address,formatted_phone_number,website,rating,price_level,opening_hours,user_ratings_total",
    },
  });

  return data.result || null;
};

module.exports = { searchRestaurant, getRestaurantDetails };
