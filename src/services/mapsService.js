/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: Service for google maps with the place and search to be able to return restaurants!
 */
const axios = require("axios");

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

// Our budget levels (1-4) mapped to Google's Places API (New) price levels
const GOOGLE_PRICE_LEVELS = {
  1: "PRICE_LEVEL_INEXPENSIVE",
  2: "PRICE_LEVEL_MODERATE",
  3: "PRICE_LEVEL_EXPENSIVE",
  4: "PRICE_LEVEL_VERY_EXPENSIVE",
};

// Straight-line distance in miles between two { latitude, longitude } points
// (haversine formula). Good enough for "0.8 mi away"; not driving distance.
const milesBetween = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// priceLevels: array of 1-4 chosen by the user, or empty for any price
const searchRestaurant = async (
  query,
  priceLevels = [],
  radiusMiles = 10,
  coordinates = null,
) => {
  const radiusMeters = Math.round(radiusMiles * 1609.34);

  const requestBody = {
    textQuery: query,
    includedType: "restaurant",
    maxResultCount: 3,
  };

  // Note: Google excludes places with no price data when this filter is set
  if (priceLevels.length > 0) {
    requestBody.priceLevels = priceLevels.map((n) => GOOGLE_PRICE_LEVELS[n]);
  }

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
          "places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours,places.location,places.websiteUri,places.nationalPhoneNumber",
      },
    });


    const results = response.data.places || [];
    return results.map((p) => ({
      place_id: p.id,
      name: p.displayName?.text,
      address: p.formattedAddress,
      short_address: p.shortFormattedAddress || p.formattedAddress,
      distance_miles:
        coordinates && p.location
          ? Math.round(milesBetween(coordinates, p.location) * 10) / 10
          : null,
      website: p.websiteUri || null,
      phone: p.nationalPhoneNumber || null,
      // Seven strings, Monday first: "Monday: 10:00 AM – 10:00 PM"
      hours: p.regularOpeningHours?.weekdayDescriptions || [],
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

const getResolvedLocationName = async (locationStr) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationStr)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" && data.results.length > 0) {
      return data.results[0].formatted_address;
    }
    return null;
  } catch {
    return null;
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

module.exports = {
  searchRestaurant,
  getRestaurantDetails,
  getUserCoordinates,
  getResolvedLocationName,
};
