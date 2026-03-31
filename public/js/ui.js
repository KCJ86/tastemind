// ── UI LAYER ───────────────────────────────────────
// All DOM rendering lives here.
// No fetch calls, no business logic — just building HTML.

const ui = {
  // ── UTILS ─────────────────────────────────────────
  showScreen: (id) => {
    document
      .querySelectorAll(".screen")
      .forEach((s) => s.classList.remove("active"));
    document.getElementById(`screen-${id}`).classList.add("active");
  },

  showToast: (msg, type = "") => {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => (t.className = "toast"), 3000);
  },

  stars: (n) => "★".repeat(n) + "☆".repeat(5 - n),

  priceLevel: (level) => {
    const map = {
      PRICE_LEVEL_INEXPENSIVE: "$",
      PRICE_LEVEL_MODERATE: "$$",
      PRICE_LEVEL_EXPENSIVE: "$$$",
      PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
    };
    return map[level] || "";
  },

  priceLevelInt: (level) => {
    const map = {
      PRICE_LEVEL_INEXPENSIVE: 1,
      PRICE_LEVEL_MODERATE: 2,
      PRICE_LEVEL_EXPENSIVE: 3,
      PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };
    return map[level] || null;
  },

  // ── HEADER ────────────────────────────────────────
  renderHeader: (user) => {
    const initials = user.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    document.getElementById("header-right").innerHTML = `
      <div class="user-pill">
        <div class="user-avatar">${initials}</div>
        ${user.name}
      </div>
      <button class="nav-btn" id="rate-btn">Rate a meal</button>
    `;
  },

  // ── TASTE TAGS ────────────────────────────────────
  renderTasteTags: (user) => {
    const liked = JSON.parse(user.liked_cuisines || "[]");
    const container = document.getElementById("taste-tags");
    container.innerHTML =
      liked.length === 0
        ? '<span class="taste-tag">No preferences yet</span>'
        : liked
            .map((c) => `<span class="taste-tag liked">${c}</span>`)
            .join("");
  },

  // ── VISIT HISTORY ─────────────────────────────────
  renderHistory: (visits) => {
    const list = document.getElementById("history-list");

    if (!visits || visits.length === 0) {
      list.innerHTML = '<div class="empty-history">No visits yet</div>';
      return;
    }

    list.innerHTML = visits
      .map(
        (v) => `
      <div class="history-item" data-visit-id="${v.id}" data-visit-name="${v.restaurant_name}">
        <div>
          <div class="history-name">${v.restaurant_name}</div>
          <div class="history-meta">
            ${v.cuisine_type || "Unknown"} · ${new Date(v.visited_at).toLocaleDateString()}
          </div>
        </div>
        <div class="history-stars">
          ${v.rating ? ui.stars(v.rating) : "—"}
        </div>
      </div>
    `,
      )
      .join("");
  },

  // ── LOADING STATE ─────────────────────────────────
  renderLoading: () => {
    document.getElementById("main-content").innerHTML = `
      <div class="loading-state">
        <div class="loading-ring"></div>
        <div class="loading-text">Consulting your palate…</div>
        <div class="loading-step">Claude is thinking</div>
      </div>
    `;
  },

  // Cycles through loading steps while waiting for API
  startLoadingSteps: () => {
    const steps = [
      "Reading your taste history…",
      "Finding perfect matches…",
      "Checking what's nearby…",
    ];
    let i = 0;
    return setInterval(() => {
      const el = document.querySelector(".loading-step");
      if (el && i < steps.length) el.textContent = steps[i++];
    }, 1800);
  },

  // ── EMPTY STATE ───────────────────────────────────
  renderEmpty: () => {
    document.getElementById("main-content").innerHTML = `
      <div class="empty-state">
        <div class="empty-glyph">✦</div>
        <div class="empty-title">Where shall we dine tonight?</div>
        <div class="empty-sub">Describe your craving in the panel and let TasteMind find your perfect meal.</div>
      </div>
    `;
  },

  // ── ERROR STATE ───────────────────────────────────
  renderError: () => {
    document.getElementById("main-content").innerHTML = `
      <div class="empty-state">
        <div class="empty-glyph">!</div>
        <div class="empty-title">Something went wrong</div>
        <div class="empty-sub">Make sure the backend is running on port 3000</div>
      </div>
    `;
  },

  // ── RECOMMENDATIONS ───────────────────────────────
  renderRecommendations: (data, onSave) => {
    const groups = data.recommendations
      .map((rec, i) => {
        const cards =
          rec.places.length > 0
            ? rec.places
                .map((p) => ui.restaurantCard(p, rec.cuisine_type, onSave))
                .join("")
            : `<div style="font-size:13px;color:var(--muted2);font-style:italic;padding:16px 0">
             No places found nearby — try a different search
           </div>`;

        return `
        <div class="rec-group" style="animation-delay:${i * 0.12}s">
          <div class="rec-group-header">
            <div class="rec-cuisine">${rec.cuisine_type}</div>
          </div>
          <div class="rec-reason">${rec.reason}</div>
          <div class="cards-row">${cards}</div>
        </div>
      `;
      })
      .join("");

    document.getElementById("main-content").innerHTML = `
      <div class="ai-banner">
        <div class="ai-icon">✦ AI</div>
        <div class="ai-summary">${data.summary}</div>
      </div>
      ${groups}
    `;
  },

  // ── RESTAURANT CARD ───────────────────────────────
  restaurantCard: (p, cuisine, onSave) => {
    const price = ui.priceLevel(p.price_level);
    const openBadge =
      p.open_now === true
        ? '<span class="meta-pill open">Open</span>'
        : p.open_now === false
          ? '<span class="meta-pill closed">Closed</span>'
          : "";

    // Encode restaurant data for the save button
    const data = encodeURIComponent(
      JSON.stringify({
        place_id: p.place_id,
        restaurant_name: p.name,
        cuisine_type: cuisine,
        price_level: ui.priceLevelInt(p.price_level),
        address: p.address,
      }),
    );

    return `
      <div class="restaurant-card">
        <div class="card-name">${p.name}</div>
        <div class="card-address">${p.address || ""}</div>
        <div class="card-meta">
          ${
            p.rating
              ? `<span class="meta-pill rating">★ ${p.rating} (${p.total_ratings?.toLocaleString() || 0})</span>`
              : ""
          }
          ${price ? `<span class="meta-pill">${price}</span>` : ""}
          ${openBadge}
        </div>
        <div class="card-actions">
          <button
            class="card-save-btn"
            data-restaurant="${data}"
          >
            I'm going here →
          </button>
        </div>
      </div>
    `;
  },

  // ── RATING MODAL ──────────────────────────────────
  renderRatingModal: (visit_id, name) => {
    document.getElementById("modal-container").innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal">
          <div class="modal-eyebrow">Rate your experience</div>
          <div class="modal-title">${name}</div>
          <div class="modal-sub">
            How was your meal? This helps TasteMind learn your taste.
          </div>

          <div class="star-row" id="star-row">
            ${[1, 2, 3, 4, 5]
              .map((n) => `<span class="star" data-value="${n}">★</span>`)
              .join("")}
          </div>

          <textarea
            class="fancy-input"
            id="rate-notes"
            placeholder="Any notes? e.g. 'pasta was incredible, super cozy vibes'"
            rows="3"
            style="margin-top:4px"
          ></textarea>

          <div class="modal-actions">
            <button class="modal-cancel" id="modal-cancel-btn">Skip</button>
            <button class="modal-confirm" id="modal-confirm-btn" disabled>
              Save rating →
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ── STAR INTERACTIONS ─────────────────────────────
  updateStars: (n) => {
    document.querySelectorAll(".star").forEach((s, i) => {
      s.classList.toggle("active", i < n);
    });
  },

  closeModal: () => {
    document.getElementById("modal-container").innerHTML = "";
  },
};
