/**
 * Author: Kennedy Castillon Jimenez
 * Date: March 27th, 2026
 * Summary: Service for google maps with the place and search to be able to return restaraunts!
 */

const axios = require("axios");

const PLACES_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

const PRICE_MAP = { $: 1, $$: 2, $$$: 3, $$$$: 4 };

const searchRestaurant = async (query, priceRange) => {
  const params = {
    query,
    type: "restaurant",
    key: process.env.GOOGLE_MAPS_API_KEY,
  };

  if (priceRange && PRICE_MAP[priceRange]) {
    params.maxprice = PRICE_MAP[priceRange];
  }

  const { data } = await axios.get(PLACES_URL, { params });
  const results = data.results?.slice(0, 3) || [];

  return results.map((p) => ({
    place_id: p.place_id,
    name: p.name,
    address: p.formatted_address,
    rating: p.rating,
    total_ratings: p.user_ratings_total,
    price_level: p.price_level,
    open_now: p.opening_hours?.open_now,
    location: p.geometry?.location,
  }));
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
