// ── UI LAYER ───────────────────────────────────────
// All DOM rendering lives here.
// No fetch calls, no business logic — just building HTML.

// ── RESTAURANT DATA STORE ──────────────────────────
// Keeps restaurant data in memory instead of encoding into DOM attributes
const restaurantStore = new Map();

// Inline SVG icons, reused across templates
const ICONS = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/></svg>',
  memory:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>',
  meals:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7h3"/></svg>',
};

const ui = {
  // ── UTILS ─────────────────────────────────────────

  // Escapes text before it goes into innerHTML. Names, notes and Claude's
  // text are all outside data — without this, a name like
  // <img src=x onerror=...> would run as code in the page.
  esc: (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),

  showScreen: (id) => {
    document
      .querySelectorAll(".screen")
      .forEach((s) => s.classList.remove("active"));
    document.getElementById(`screen-${id}`).classList.add("active");
  },

  showToast: (msg) => {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(ui._toastTimer);
    ui._toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
  },

  // Five star buttons. `cls` distinguishes the modal, slip and prompt rows
  // so app.js's click handler knows which flow a click belongs to.
  starButtons: (cls, active = 0) =>
    [1, 2, 3, 4, 5]
      .map(
        (n) => `
        <button class="star-btn ${cls}${n <= active ? " active" : ""}"
          data-value="${n}" aria-label="${n} out of 5">${ICONS.star}</button>`,
      )
      .join(""),

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

  greeting: () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  },

  // ── HEADER ────────────────────────────────────────
  renderHeader: (user, visitCount = 0) => {
    const initials = user.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const liked = JSON.parse(user.liked_cuisines || "[]");

    document.getElementById("greeting").textContent =
      `${ui.greeting()}, ${user.name.split(" ")[0]}`;

    document.getElementById("header-right").innerHTML = `
      <button class="meals-btn" id="meals-btn" aria-label="Your meals">
        ${ICONS.meals}
        <span class="meals-label">Your meals</span>
        <span class="badge" id="pending-badge" style="display:none">0</span>
      </button>
      <div class="account">
        <button class="avatar" id="user-pill" aria-label="Account" aria-haspopup="true">
          ${ui.esc(initials)}
        </button>
        <div class="menu" id="user-dropdown" style="display:none">
          <div class="menu-head">
            <div class="menu-name">${ui.esc(user.name)}</div>
            <div class="menu-sub dropdown-location">${ui.esc(user.location || "No location set")}</div>
            <button class="code-row" id="copy-code-btn">
              <span>
                <span class="code-label">Your sign-in code</span><br />
                <span class="code-value">${ui.esc(user.user_code)}</span>
              </span>
              <span class="code-copy">Copy</span>
            </button>
            <p class="menu-stats">${visitCount} ${visitCount === 1 ? "meal" : "meals"} reviewed, ${liked.length} favorite ${liked.length === 1 ? "cuisine" : "cuisines"}</p>
          </div>
          <button class="menu-item" id="dropdown-home">Back to start</button>
          <button class="menu-item danger" id="dropdown-signout">Sign out</button>
        </div>
      </div>
    `;
  },

  clearHeader: () => {
    document.getElementById("header-right").innerHTML = "";
    document.getElementById("greeting").textContent = "";
  },

  // ── LOCATION ──────────────────────────────────────
  renderLocation: (location) => {
    const text = document.getElementById("location-text");
    if (text) text.textContent = location || "No location set";
  },

  // ── TASTE TAGS ────────────────────────────────────
  renderTasteTags: (user) => {
    const liked = JSON.parse(user.liked_cuisines || "[]");
    document.getElementById("taste-tags").innerHTML =
      liked.length === 0
        ? '<p class="empty-note">Rate a meal 4 stars or higher and its cuisine shows up here.</p>'
        : liked.map((c) => `<span class="tag">${ui.esc(c)}</span>`).join("");
  },

  // ── VISIT HISTORY ─────────────────────────────────
  renderHistory: (visits) => {
    const list = document.getElementById("history-list");
    const section = list.parentElement;
    section.querySelector(".empty-note")?.remove();

    if (!visits || visits.length === 0) {
      list.innerHTML = "";
      list.insertAdjacentHTML(
        "beforebegin",
        '<p class="empty-note">Meals you review will show up here.</p>',
      );
      return;
    }

    list.innerHTML = visits
      .map(
        (v) => `
        <button class="list-item history-item" data-visit-id="${v.id}" data-visit-name="${ui.esc(v.restaurant_name)}">
          <span>
            <span class="item-name">${ui.esc(v.restaurant_name)}</span><br />
            <span class="item-meta">${ui.esc(v.cuisine_type || "Restaurant")}, ${new Date(v.visited_at).toLocaleDateString()}</span>
          </span>
          <span class="item-rating">${v.rating ? `${v.rating} of 5` : "Not rated"}</span>
        </button>`,
      )
      .join("");
  },

  // ── PENDING ───────────────────────────────────────
  renderPendingList: (pending) => {
    const list = document.getElementById("pending-list");
    if (!list) return;
    list.innerHTML = (pending || [])
      .map(
        (r) => `
        <button class="list-item pending-item" data-place-id="${ui.esc(r.place_id)}">
          <span>
            <span class="item-name">${ui.esc(r.restaurant_name)}</span><br />
            <span class="item-meta">${ui.esc(r.cuisine_type || "Restaurant")}</span>
          </span>
          <span class="dot" aria-hidden="true"></span>
        </button>`,
      )
      .join("");
  },

  // Most recent pending meal, shown above the results so the review loop
  // is one tap away instead of buried in the drawer.
  renderReviewPrompt: (pending) => {
    const slot = document.getElementById("review-prompt");
    const latest = pending && pending[pending.length - 1];
    if (!latest) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = `
      <div class="prompt steel">
        <div>
          <p class="prompt-label">Waiting for your review</p>
          <h2 class="prompt-title">How was ${ui.esc(latest.restaurant_name)}?</h2>
        </div>
        <div class="stars" data-place-id="${ui.esc(latest.place_id)}">
          ${ui.starButtons("prompt-star")}
        </div>
      </div>`;
  },

  // ── REVIEW SLIP ───────────────────────────────────
  renderReviewSlip: (restaurant, rating = 0) => {
    document.getElementById("review-prompt").innerHTML = "";
    document.getElementById("main-content").innerHTML = `
      <div class="panel slip">
        <p class="prompt-label">Your review</p>
        <h2 class="slip-title">${ui.esc(restaurant.restaurant_name)}</h2>
        <p class="slip-meta">${ui.esc([restaurant.cuisine_type, restaurant.address].filter(Boolean).join(", "))}</p>
        <div class="stars" id="review-star-row">${ui.starButtons("review-star", rating)}</div>
        <label class="visually-hidden" for="review-notes">Notes</label>
        <textarea class="field" id="review-notes" rows="3"
          placeholder="What stood out? e.g. the broth was incredible, a bit loud though"></textarea>
        <div class="slip-actions">
          <button class="btn btn-secondary" id="review-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="review-submit-btn" ${rating ? "" : "disabled"}>Save review</button>
        </div>
      </div>`;
  },

  updateReviewStars: (n) => {
    document.querySelectorAll(".review-star").forEach((s, i) => {
      s.classList.toggle("active", i < n);
    });
  },

  // ── LOADING STATE ─────────────────────────────────
  renderLoading: () => {
    document.getElementById("main-content").innerHTML = `
      <div class="state" role="status">
        <div class="spinner" aria-hidden="true"></div>
        <p class="state-title">Finding your table</p>
        <p class="state-sub loading-step">Reading your taste history</p>
      </div>`;
  },

  // Cycles through loading steps while waiting for the API
  startLoadingSteps: () => {
    const steps = [
      "Matching your craving to past meals",
      "Checking what's nearby",
      "Picking the best fits",
    ];
    let i = 0;
    return setInterval(() => {
      const el = document.querySelector(".loading-step");
      if (el && i < steps.length) el.textContent = steps[i++];
    }, 1800);
  },

  // ── EMPTY / ERROR / LIMIT ─────────────────────────
  // The search area above already invites a craving, so the empty state is
  // simply empty.
  renderEmpty: () => {
    document.getElementById("main-content").innerHTML = "";
  },

  renderError: () => {
    document.getElementById("main-content").innerHTML = `
      <div class="state">
        <p class="state-title">Recommendations didn't load</p>
        <p class="state-sub">Check your connection and try your search again.</p>
      </div>`;
  },

  renderLimitReached: () => {
    document.getElementById("main-content").innerHTML = `
      <div class="state">
        <p class="state-title">You've used today's recommendations</p>
        <p class="state-sub">New ones are available after midnight. In the meantime, review a recent meal so tomorrow's picks are even better.</p>
      </div>`;
  },

  // ── RECOMMENDATIONS ───────────────────────────────
  renderRecommendations: (data) => {
    const groups = data.options
      .filter((option) => option.places && option.places.length > 0)
      .map((option) => {
        const cards = option.places
          .map((p) => ui.restaurantCard(p, option.label))
          .join("");
        // `because` is filled in by the backend when a retrieved past review
        // informed this option; the line only appears when there is one.
        const memory = option.because
          ? `<p class="memory">${ICONS.memory}<span>${ui.esc(option.because)}</span></p>`
          : "";
        // Each cuisine gets its own steel rail with tickets hanging from it
        return `
          <section class="group">
            <h3 class="group-title">${ui.esc(option.label)}</h3>
            ${memory}
            <div class="rail" aria-hidden="true"></div>
            <div class="cards">${cards}</div>
          </section>`;
      })
      .join("");

    document.getElementById("main-content").innerHTML = `
      <div class="results-head">
        <h2 class="results-title">${ui.esc(data.vibe)}</h2>
        <p class="results-reason">${ui.esc(data.reason)}</p>
      </div>
      ${groups}`;
  },

  // ── RESTAURANT CARD ───────────────────────────────
  restaurantCard: (p, cuisine) => {
    const price = ui.priceLevel(p.price_level);

    // Store restaurant data in memory, keyed by place_id
    restaurantStore.set(p.place_id, {
      place_id: p.place_id,
      restaurant_name: p.name,
      cuisine_type: cuisine,
      price_level: ui.priceLevelInt(p.price_level),
      address: p.address,
    });

    // Printed like the details line on a kitchen ticket
    const facts = [
      p.rating
        ? `<li>${p.rating} stars (${(p.total_ratings || 0).toLocaleString()})</li>`
        : "",
      price ? `<li>${price}</li>` : "",
      p.open_now === true ? '<li class="open">Open now</li>' : "",
      p.open_now === false ? '<li class="closed">Closed</li>' : "",
    ].join("");

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.place_id)}`;

    // "699 Valencia St · 0.8 mi" instead of the full postal address
    const where = [
      p.short_address || p.address,
      p.distance_miles != null ? `${p.distance_miles} mi` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return `
      <article class="card ticket">
        <span class="clip" aria-hidden="true"></span>
        <h4 class="card-name">${ui.esc(p.name)}</h4>
        <p class="card-address">${ui.esc(where)}</p>
        ${facts ? `<ul class="facts">${facts}</ul>` : ""}
        <div class="card-actions">
          <button class="btn btn-primary card-save-btn" data-place-id="${ui.esc(p.place_id)}">I'm going here</button>
          <a href="${mapsUrl}" target="_blank" rel="noopener">Directions</a>
        </div>
        ${ui.ticketDetails(p)}
      </article>`;
  },

  // Today's hours: Google lists the week Monday-first, JS counts Sunday as 0
  todayHours: (hours) => {
    if (!hours || hours.length !== 7) return "";
    const line = hours[(new Date().getDay() + 6) % 7] || "";
    return line.replace(/^[^:]+:\s*/, ""); // drop the "Monday: " prefix
  },

  // Only allow real web links from outside data into an href
  safeUrl: (url) => {
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
    } catch {
      return "";
    }
  },

  // The tear-off bottom of the ticket. A native <details> element opens and
  // closes on its own and works with the keyboard and screen readers.
  ticketDetails: (p) => {
    const today = ui.todayHours(p.hours);
    const site = ui.safeUrl(p.website);
    const phone = p.phone ? String(p.phone) : "";
    const tel = phone.replace(/[^\d+]/g, "");

    const rows = [
      today ? `<div><dt>Today</dt><dd>${ui.esc(today)}</dd></div>` : "",
      site
        ? `<div><dt>Website</dt><dd><a href="${ui.esc(site)}" target="_blank" rel="noopener">${ui.esc(new URL(site).hostname.replace(/^www\./, ""))}</a></dd></div>`
        : "",
      phone
        ? `<div><dt>Phone</dt><dd><a href="tel:${ui.esc(tel)}">${ui.esc(phone)}</a></dd></div>`
        : "",
    ].join("");

    if (!rows) return "";
    return `
      <details class="ticket-more">
        <summary>More details</summary>
        <dl class="ticket-facts">${rows}</dl>
      </details>`;
  },

  // ── RATING MODAL (re-rating a past meal) ──────────
  renderRatingModal: (visit_id, name) => {
    document.getElementById("modal-container").innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 class="modal-title" id="modal-title">${ui.esc(name)}</h2>
          <p class="modal-sub">Changed your mind? A new rating replaces the old one.</p>
          <div class="stars" id="star-row">${ui.starButtons("star")}</div>
          <label class="visually-hidden" for="rate-notes">Notes</label>
          <textarea class="field" id="rate-notes" rows="3"
            placeholder="What stood out? e.g. the pasta was incredible"></textarea>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm-btn" disabled>Save rating</button>
          </div>
        </div>
      </div>`;
  },

  updateStars: (n) => {
    document.querySelectorAll(".star-btn.star").forEach((s, i) => {
      s.classList.toggle("active", i < n);
    });
  },

  closeModal: () => {
    document.getElementById("modal-container").innerHTML = "";
  },

  // ── DRAWER ────────────────────────────────────────
  openDrawer: () => {
    const drawer = document.getElementById("drawer");
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.getElementById("drawer-scrim").hidden = false;
    document.getElementById("drawer-close").focus();
  },

  closeDrawer: () => {
    const drawer = document.getElementById("drawer");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.getElementById("drawer-scrim").hidden = true;
  },
};
