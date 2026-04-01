/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: Service for google maps with the place and search to be able to return restaurants!
 */
const axios = require("axios");

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

const searchRestaurant = async (
  query,
  priceRange,
  radiusMiles = 10,
  coordinates = null,
) => {
  const radiusMeters = Math.round(radiusMiles * 1609.34);

  const requestBody = {
    textQuery: query,
    includedType: "restaurant",
    maxResultCount: 3,
  };

  if (coordinates) {
    requestBody.locationRestriction = {
      rectangle: {
        low: {
          latitude: coordinates.latitude - radiusMiles / 69,
          longitude: coordinates.longitude - radiusMiles / 55,
        },
        high: {
          latitude: coordinates.latitude + radiusMiles / 69,
          longitude: coordinates.longitude + radiusMiles / 55,
        },
      },
    };
  }

  try {
    const response = await axios.post(PLACES_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours,places.location",
      },
    });

    console.log("🗺️ Raw response:", JSON.stringify(response.data, null, 2));
    console.log("🗺️ Request body sent:", JSON.stringify(requestBody, null, 2));

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
  try {
    const { data } = await axios.get(DETAILS_URL, {
      params: {
        place_id,
        key: process.env.GOOGLE_MAPS_API_KEY,
        fields:
          "name,formatted_address,formatted_phone_number,website,rating,price_level,opening_hours,user_ratings_total",
      },
    });
    return data.result || null;
  } catch (err) {
    console.error("🗺️ Details error:", err.message);
    return null;
  }
};

const getUserCoordinates = async (location) => {
  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address: location,
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    );
    const result = response.data.results[0];
    if (!result) return null;
    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    };
  } catch {
    return null;
  }
};

module.exports = { searchRestaurant, getRestaurantDetails, getUserCoordinates };
