// ── API LAYER ──────────────────────────────────────
// All backend communication lives here.
// No DOM manipulation, no state — just fetch calls.

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/api/v1"
    : `${window.location.origin}/api/v1`;

const api = {
  // ── USERS ────────────────────────────────────────
  createUser: async (name, location) => {
    const res = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, location }),
    });
    return res.json();
  },

  getUser: async (user_code) => {
    const res = await fetch(`${API_BASE}/users/${user_code}`);
    return res.json();
  },

  getVisits: async (user_code) => {
    const res = await fetch(`${API_BASE}/users/${user_code}/visits`);
    return res.json();
  },

  rateVisit: async (user_code, visit_id, rating, notes) => {
    const res = await fetch(
      `${API_BASE}/users/${user_code}/visits/${visit_id}/rate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, notes }),
      },
    );
    return res.json();
  },

  updateTaste: async (user_code, updates) => {
    const res = await fetch(`${API_BASE}/users/${user_code}/taste`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  // ── RECOMMENDATIONS ──────────────────────────────
  getRecommendations: async (
    user_code,
    craving,
    location = null,
    radius = 10,
  ) => {
    const res = await fetch(`${API_BASE}/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_code, craving, location, radius }),
    });
    return res.json();
  },

  saveVisit: async (user_code, restaurant) => {
    const res = await fetch(`${API_BASE}/recommendations/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_code, ...restaurant }),
    });
    return res.json();
  },
};
