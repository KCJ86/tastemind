// ── API LAYER ──────────────────────────────────────
// All backend communication lives here.
// No DOM manipulation, no state — just fetch calls.

// Same origin as the page, so the session cookie is sent automatically.
const API_BASE = "/api/v1";

// Every call resolves to the JSON body plus `status`, so callers can tell a
// wrong password (401) from a taken username (409) from a rate limit (429).
const request = async (method, path, body) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));

  // A 401 from anywhere but /auth means the session expired or was signed
  // out elsewhere. /auth 401s are answers (wrong password, bad code) that
  // the sign-in forms show themselves.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    api.onUnauthorized();
  }
  return { ...data, status: res.status };
};

const api = {
  // Replaced by app.js; sends the user back to the sign-in screen.
  onUnauthorized: () => {},

  // ── AUTH ─────────────────────────────────────────
  me: () => request("GET", "/auth/me"),

  signup: (fields) => request("POST", "/auth/signup", fields),

  login: (username, password) =>
    request("POST", "/auth/login", { username, password }),

  logout: () => request("POST", "/auth/logout"),

  // ── USER ─────────────────────────────────────────
  getVisits: () => request("GET", "/users/me/visits"),

  rateVisit: (visit_id, rating, notes) =>
    request("POST", `/users/me/visits/${visit_id}/rate`, { rating, notes }),

  updateTaste: (updates) => request("PATCH", "/users/me/taste", updates),

  updateLocation: (location) =>
    request("PATCH", "/users/me/location", { location }),

  // ── RECOMMENDATIONS ──────────────────────────────
  getRecommendations: (craving, location = null, radius = 10, priceLevels = []) =>
    request("POST", "/recommendations", {
      craving,
      location,
      radius,
      price_levels: priceLevels,
    }),

  saveVisit: (restaurant) => request("POST", "/recommendations/save", restaurant),
};
