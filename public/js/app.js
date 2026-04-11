// ── APP LAYER ──────────────────────────────────────
// Main state, event handlers, and orchestration.

// ── STATE ──────────────────────────────────────────
const state = {
  currentUser: null,
  selectedRating: 0,
  pendingRateVisit: null,
  searchRadius: 10,
};

// ── INIT ───────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  bindStaticEvents();
  const savedCode = localStorage.getItem("tm_user_code");
  if (savedCode) fetchAndEnterApp(savedCode);
});

// ── STATIC EVENT BINDINGS ──────────────────────────
function bindStaticEvents() {
  document
    .getElementById("create-user-btn")
    .addEventListener("click", handleCreateUser);
  document
    .getElementById("load-user-btn")
    .addEventListener("click", handleLoadUser);
  document.getElementById("returning-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLoadUser();
  });
  document.getElementById("radius-slider").addEventListener("input", (e) => {
    const val = e.target.value;
    document.getElementById("radius-value").textContent = `${val} miles`;
    state.searchRadius = parseInt(val);
  });
  document
    .getElementById("ask-btn")
    .addEventListener("click", handleGetRecommendations);
  document.getElementById("craving-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGetRecommendations();
    }
  });
}

// ── DELEGATED CLICK HANDLER ────────────────────────
document.addEventListener("click", (e) => {
  console.log("clicked:", e.target.id, e.target.className);

  // Save restaurant button
  const saveBtn = e.target.closest(".card-save-btn");
  if (saveBtn && !saveBtn.disabled) {
    const placeId = saveBtn.dataset.placeId;
    const data = restaurantStore.get(placeId);
    if (data) handleSaveVisit(data, saveBtn);
    return;
  }

  // Pending list item — open review slip
  const pendingItem = e.target.closest(".pending-item");
  if (pendingItem) {
    openReviewSlip(pendingItem.dataset.placeId);
    return;
  }

  // History item — open rating modal
  const historyItem = e.target.closest(".history-item:not(.pending-item)");
  if (historyItem) {
    const { visitId, visitName } = historyItem.dataset;
    openRatingModal(parseInt(visitId), visitName);
    return;
  }

  // Review slip star
  const reviewStar = e.target.closest(".review-star");
  if (reviewStar) {
    state.selectedRating = parseInt(reviewStar.dataset.value);
    ui.updateReviewStars(state.selectedRating);
    document.getElementById("review-submit-btn").disabled = false;
    return;
  }

  // Review slip submit
  if (e.target.closest("#review-submit-btn")) {
    handleSubmitReview();
    return;
  }

  // Review slip cancel
  if (e.target.closest("#review-cancel-btn")) {
    ui.renderEmpty();
    return;
  }

  // Modal star rating
  const star = e.target.closest(".star:not(.review-star)");
  if (star) {
    state.selectedRating = parseInt(star.dataset.value);
    ui.updateStars(state.selectedRating);
    document.getElementById("modal-confirm-btn").disabled = false;
    return;
  }

  // Modal confirm
  if (e.target.closest("#modal-confirm-btn")) {
    handleSubmitRating();
    return;
  }

  // Modal cancel
  if (e.target.closest("#modal-cancel-btn")) {
    ui.closeModal();
    return;
  }

  // Click outside modal
  if (e.target.id === "modal-overlay") {
    ui.closeModal();
    return;
  }

  // Copy user code
  if (e.target.closest("#copy-code-btn")) {
    navigator.clipboard.writeText(state.currentUser.user_code);
    ui.showToast("Code copied to clipboard! ✦", "gold");
    return;
  }

  // Go home
  if (e.target.closest("#dropdown-home")) {
    const dd = document.getElementById("user-dropdown");
    if (dd) dd.style.display = "none";
    ui.showScreen("onboard");
    return;
  }

  // Sign out
  if (e.target.closest("#dropdown-signout")) {
    localStorage.removeItem("tm_user_code");
    state.currentUser = null;
    state.selectedRating = 0;
    state.pendingRateVisit = null;
    document.getElementById("header-right").innerHTML = `
      <button class="nav-btn" id="signin-btn">Sign in</button>
    `;
    ui.showScreen("onboard");
    ui.showToast("Signed out successfully");
    return;
  }

  // Rate a meal nav btn
  if (e.target.closest("#rate-btn")) {
    handleRatePrompt();
    return;
  }

  // Toggle user dropdown
  if (e.target.closest("#user-pill")) {
    const dropdown = document.getElementById("user-dropdown");
    if (dropdown) {
      const isOpen = dropdown.style.display !== "none";
      dropdown.style.display = isOpen ? "none" : "block";
    }
    return;
  }

  // Close dropdown when clicking outside
  if (!e.target.closest(".user-dropdown") && !e.target.closest("#user-pill")) {
    const dropdown = document.getElementById("user-dropdown");
    if (dropdown) dropdown.style.display = "none";
  }
});

// ── STAR HOVER ─────────────────────────────────────
document.addEventListener("mouseover", (e) => {
  const star = e.target.closest(".star:not(.review-star)");
  if (star) ui.updateStars(parseInt(star.dataset.value));

  const reviewStar = e.target.closest(".review-star");
  if (reviewStar) ui.updateReviewStars(parseInt(reviewStar.dataset.value));
});

document.addEventListener("mouseout", (e) => {
  const star = e.target.closest(".star:not(.review-star)");
  if (star) ui.updateStars(state.selectedRating);

  const reviewStar = e.target.closest(".review-star");
  if (reviewStar) ui.updateReviewStars(state.selectedRating);
});

// ── USER HANDLERS ──────────────────────────────────
async function handleCreateUser() {
  const name = document.getElementById("new-name").value.trim();
  const location = document.getElementById("new-location").value.trim();

  if (!name || !location) {
    ui.showToast("Please fill in both fields");
    return;
  }

  const btn = document.getElementById("create-user-btn");
  btn.disabled = true;
  btn.textContent = "Creating your profile…";

  try {
    const data = await api.createUser(name, location);
    if (!data.success) throw new Error();
    state.currentUser = data.user;
    localStorage.setItem("tm_user_code", data.user.user_code);
    enterApp();
    ui.showToast(
      `Welcome, ${data.user.name}! Your code: ${data.user.user_code}`,
      "gold",
    );
  } catch {
    ui.showToast("Could not create profile. Is the server running?");
  } finally {
    btn.disabled = false;
    btn.textContent = "Start my taste profile →";
  }
}

async function handleLoadUser() {
  const code = document.getElementById("returning-code").value.trim();
  if (!code) return;
  await fetchAndEnterApp(code);
}

async function fetchAndEnterApp(code) {
  try {
    const data = await api.getUser(code);
    if (!data.success) throw new Error();
    state.currentUser = data.user;
    localStorage.setItem("tm_user_code", code);
    enterApp();
  } catch {
    ui.showToast("User not found. Check your code.");
    localStorage.removeItem("tm_user_code");
  }
}

function enterApp() {
  ui.showScreen("app");
  refreshHistory().then((visits) => {
    ui.renderHeader(state.currentUser, visits ? visits.length : 0);
    ui.renderTasteTags(state.currentUser);
    renderSidebar();
  });
}

// ── PENDING VISITS ─────────────────────────────────
function getPending() {
  return JSON.parse(localStorage.getItem("tm_pending") || "[]");
}

function savePending(list) {
  localStorage.setItem("tm_pending", JSON.stringify(list));
}

function addPending(restaurant) {
  const list = getPending();
  if (list.find((r) => r.place_id === restaurant.place_id)) return;
  list.push({ ...restaurant, pending_at: new Date().toISOString() });
  savePending(list);
}

function removePending(place_id) {
  savePending(getPending().filter((r) => r.place_id !== place_id));
}

// ── SIDEBAR ────────────────────────────────────────
function renderSidebar() {
  const pending = getPending();

  const badge = document.getElementById("pending-badge");
  const pendingSection = document.getElementById("pending-section");
  const divider = document.getElementById("pending-divider");

  if (badge) {
    badge.textContent = pending.length;
    badge.style.display = pending.length > 0 ? "inline-flex" : "none";
  }
  if (pendingSection) {
    pendingSection.style.display = pending.length > 0 ? "block" : "none";
  }
  if (divider) {
    divider.style.display = pending.length > 0 ? "block" : "none";
  }

  ui.renderPendingList(pending);
}

// ── HISTORY ────────────────────────────────────────
async function refreshHistory() {
  try {
    const data = await api.getVisits(state.currentUser.user_code);
    const visits = data.visits || [];
    ui.renderHistory(visits);
    return visits;
  } catch {
    ui.renderHistory([]);
    return [];
  }
}

// ── RECOMMENDATIONS ────────────────────────────────
async function handleGetRecommendations() {
  const craving = document.getElementById("craving-input").value.trim();
  if (!craving) {
    ui.showToast("Tell me what you're craving first!");
    return;
  }

  const btn = document.getElementById("ask-btn");
  btn.disabled = true;

  ui.renderLoading();
  const stepInterval = ui.startLoadingSteps();

  try {
    const data = await api.getRecommendations(
      state.currentUser.user_code,
      craving,
      null,
      state.searchRadius,
    );
    clearInterval(stepInterval);

    if (data.limit_reached) {
      ui.renderLimitReached();
      return;
    }

    if (!data.success) throw new Error();
    ui.renderRecommendations(data, handleSaveVisit);
  } catch {
    clearInterval(stepInterval);
    ui.renderError();
  } finally {
    btn.disabled = false;
  }
}

// ── SAVE VISIT (marks pending, no DB yet) ──────────
async function handleSaveVisit(restaurant, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Pending feedback →";
    btn.classList.add("saved");
  }
  addPending(restaurant);
  renderSidebar();
  ui.showToast(
    "Saved to Pending Feedback ✦ Come back after your meal!",
    "gold",
  );
}

// ── REVIEW SLIP ────────────────────────────────────
function openReviewSlip(place_id) {
  const restaurant = getPending().find((r) => r.place_id === place_id);
  if (!restaurant) return;
  state.pendingRateVisit = restaurant;
  state.selectedRating = 0;
  ui.renderReviewSlip(restaurant);
}

async function handleSubmitReview() {
  if (!state.selectedRating || !state.pendingRateVisit) return;

  const notes = document.getElementById("review-notes")?.value.trim() || "";
  const restaurant = state.pendingRateVisit;

  const btn = document.getElementById("review-submit-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    // 1. Save visit to DB
    const visitData = await api.saveVisit(
      state.currentUser.user_code,
      restaurant,
    );
    if (!visitData.success) throw new Error();

    // 2. Save rating right after
    await api.rateVisit(
      state.currentUser.user_code,
      visitData.visit_id,
      state.selectedRating,
      notes,
    );

    // 3. Remove from pending
    removePending(restaurant.place_id);

    // 4. Auto update taste if highly rated
    if (state.selectedRating >= 4) await autoUpdateTaste();

    // 5. Refresh history and sidebar
    const visits = await refreshHistory();
    ui.renderHeader(state.currentUser, visits.length);
    renderSidebar();

    ui.showToast("Review saved! TasteMind just got smarter ✦", "gold");
    ui.renderEmpty();

    state.pendingRateVisit = null;
    state.selectedRating = 0;
  } catch {
    ui.showToast("Could not save review");
    btn.disabled = false;
    btn.textContent = "Submit review →";
  }
}

// ── LEGACY RATING MODAL (re-rating history items) ──
function openRatingModal(visit_id, name) {
  state.selectedRating = 0;
  state.pendingRateVisit = { visit_id, name };
  ui.renderRatingModal(visit_id, name);
}

async function handleSubmitRating() {
  if (!state.selectedRating) return;

  const notes = document.getElementById("rate-notes")?.value.trim() || "";
  const visit_id = state.pendingRateVisit?.visit_id;
  if (!visit_id) return;

  const btn = document.getElementById("modal-confirm-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const data = await api.rateVisit(
      state.currentUser.user_code,
      visit_id,
      state.selectedRating,
      notes,
    );
    if (!data.success) throw new Error();

    ui.closeModal();
    ui.showToast("Rating saved! TasteMind just got smarter ✦", "gold");
    await refreshHistory();

    if (state.selectedRating >= 4) await autoUpdateTaste();

    state.pendingRateVisit = null;
    state.selectedRating = 0;
  } catch {
    ui.showToast("Could not save rating");
    btn.disabled = false;
    btn.textContent = "Save rating →";
  }
}

// ── TASTE AUTO-UPDATE ──────────────────────────────
async function autoUpdateTaste() {
  try {
    const visitsData = await api.getVisits(state.currentUser.user_code);
    const visits = visitsData.visits || [];

    const liked = [
      ...new Set(
        visits
          .filter((v) => v.rating >= 4 && v.cuisine_type)
          .map((v) => v.cuisine_type),
      ),
    ];

    if (liked.length > 0) {
      await api.updateTaste(state.currentUser.user_code, {
        liked_cuisines: liked,
      });
      const userData = await api.getUser(state.currentUser.user_code);
      if (userData.success) {
        state.currentUser = userData.user;
        ui.renderTasteTags(state.currentUser);
      }
    }
  } catch {
    // Silently fail — not critical
  }
}

// ── RATE A MEAL NAV BTN ────────────────────────────
function handleRatePrompt() {
  const pending = getPending();
  if (pending.length > 0) {
    document
      .getElementById("pending-section")
      ?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (state.pendingRateVisit) {
    openRatingModal(
      state.pendingRateVisit.visit_id,
      state.pendingRateVisit.name,
    );
    return;
  }
  ui.showToast("Go visit a restaurant first! 🍽️");
}
