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
  // Open / close the "Your meals" drawer
  if (e.target.closest("#meals-btn")) {
    ui.openDrawer();
    return;
  }
  if (e.target.closest("#drawer-close") || e.target.id === "drawer-scrim") {
    ui.closeDrawer();
    return;
  }

  // Suggestion chip — fill the search box so the user can edit or send it
  const chip = e.target.closest(".chip");
  if (chip) {
    const input = document.getElementById("craving-input");
    input.value = chip.dataset.craving;
    input.focus();
    return;
  }

  // Star on the "Waiting for your review" prompt — open the full review
  // with that rating already selected
  const promptStar = e.target.closest(".prompt-star");
  if (promptStar) {
    const placeId = promptStar.closest(".stars").dataset.placeId;
    openReviewSlip(placeId, parseInt(promptStar.dataset.value));
    return;
  }

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
    ui.closeDrawer();
    openReviewSlip(pendingItem.dataset.placeId);
    return;
  }

  // History item — open rating modal
  const historyItem = e.target.closest(".history-item:not(.pending-item)");
  if (historyItem) {
    const { visitId, visitName } = historyItem.dataset;
    ui.closeDrawer();
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
    renderSidebar(); // brings the review prompt back
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
    ui.showToast("Code copied");
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
    document.body.classList.remove("app-active");
    localStorage.removeItem("tm_user_code");
    state.currentUser = null;
    state.selectedRating = 0;
    state.pendingRateVisit = null;
    ui.clearHeader();
    ui.closeDrawer();
    ui.renderEmpty();
    ui.showScreen("onboard");
    ui.showToast("Signed out");
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

// Escape closes whatever is on top: modal, then drawer, then account menu
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.getElementById("modal-overlay")) return ui.closeModal();
  if (document.getElementById("drawer").classList.contains("open"))
    return ui.closeDrawer();
  const dropdown = document.getElementById("user-dropdown");
  if (dropdown) dropdown.style.display = "none";
});

// ── LOCATION EDITING ───────────────────────────────
function initLocation() {
  const user = state.currentUser;
  ui.renderLocation(user.location);

  document
    .getElementById("location-edit-btn")
    ?.addEventListener("click", () => {
      document.getElementById("location-display").style.display = "none";
      document.getElementById("location-edit").style.display = "block";
      const input = document.getElementById("location-input");
      input.value = user.location || "";
      input.focus();
    });

  document
    .getElementById("location-cancel-btn")
    ?.addEventListener("click", () => {
      closeLocationEdit();
    });

  document
    .getElementById("location-save-btn")
    ?.addEventListener("click", () => {
      handleSaveLocation();
    });

  document
    .getElementById("location-input")
    ?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSaveLocation();
      if (e.key === "Escape") closeLocationEdit();
    });
}

function closeLocationEdit() {
  document.getElementById("location-display").style.display = "flex";
  document.getElementById("location-edit").style.display = "none";
  document.getElementById("location-resolved").style.display = "none";
  document.getElementById("location-resolved").textContent = "";
}

async function handleSaveLocation() {
  const input = document.getElementById("location-input").value.trim();
  if (!input) return;

  const btn = document.getElementById("location-save-btn");
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const data = await api.updateLocation(state.currentUser.user_code, input);

    if (data.invalid) {
      // Show error — location not found
      const resolved = document.getElementById("location-resolved");
      resolved.style.display = "block";
      resolved.className = "location-resolved error";
      resolved.textContent = data.error;
      btn.disabled = false;
      btn.textContent = "Update location";
      return;
    }

    if (!data.success) throw new Error();

    // Show resolved address for confirmation
    const resolved = document.getElementById("location-resolved");
    resolved.style.display = "block";
    resolved.className = "location-resolved success";
    resolved.textContent = `Found ${data.location}`;

    // Update state + UI
    state.currentUser.location = data.location;
    ui.renderLocation(data.location);

    // Update dropdown location label
    const dropdownLocation = document.querySelector(".dropdown-location");
    if (dropdownLocation) dropdownLocation.textContent = data.location;

    ui.showToast("Location updated");

    setTimeout(() => closeLocationEdit(), 1500);
  } catch {
    ui.showToast("Could not update location");
    btn.disabled = false;
    btn.textContent = "Update location";
  }
}

// ── STAR HOVER ─────────────────────────────────────
// Previews a rating while hovering, then restores the chosen one.
function highlightRow(row, n) {
  row.querySelectorAll(".star-btn").forEach((s, i) => {
    s.classList.toggle("active", i < n);
  });
}

document.addEventListener("mouseover", (e) => {
  const star = e.target.closest(".star-btn");
  if (star) highlightRow(star.parentElement, parseInt(star.dataset.value));
});

document.addEventListener("mouseout", (e) => {
  const star = e.target.closest(".star-btn");
  if (!star) return;
  // The prompt row has no saved selection; the slip and modal use state
  const chosen = star.classList.contains("prompt-star")
    ? 0
    : state.selectedRating;
  highlightRow(star.parentElement, chosen);
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
      `Welcome, ${data.user.name}. Your sign-in code is ${data.user.user_code}`,
    );
  } catch {
    ui.showToast("Couldn't create your profile. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create my taste profile";
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
    ui.showToast("No profile matches that code. Check it and try again.");
    localStorage.removeItem("tm_user_code");
  }
}

function enterApp() {
  ui.showScreen("app");
  document.body.classList.add("app-active"); // ← add this
  refreshHistory().then((visits) => {
    ui.renderHeader(state.currentUser, visits ? visits.length : 0);
    ui.renderTasteTags(state.currentUser);
    renderSidebar();
    initLocation();
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

  if (badge) {
    badge.textContent = pending.length;
    badge.style.display = pending.length > 0 ? "inline-flex" : "none";
  }
  if (pendingSection) {
    pendingSection.style.display = pending.length > 0 ? "block" : "none";
  }
  ui.renderPendingList(pending);
  ui.renderReviewPrompt(pending);
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
    ui.showToast("Type a craving first");
    document.getElementById("craving-input").focus();
    return;
  }

  const btn = document.getElementById("ask-btn");
  btn.disabled = true;

  ui.renderLoading();
  scrollToResults();
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
    ui.renderRecommendations(data);
    scrollToResults();
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
    btn.textContent = "Saved for review";
    btn.classList.add("saved");
  }
  addPending(restaurant);
  renderSidebar();
  ui.showToast("Saved. Rate it after your meal.");
}

// ── REVIEW SLIP ────────────────────────────────────
function openReviewSlip(place_id, rating = 0) {
  const restaurant = getPending().find((r) => r.place_id === place_id);
  if (!restaurant) return;
  state.pendingRateVisit = restaurant;
  state.selectedRating = rating;
  ui.renderReviewSlip(restaurant, rating);
  scrollToResults();
  document.getElementById("review-notes")?.focus({ preventScroll: true });
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

    ui.showToast("Review saved");
    ui.renderEmpty();

    state.pendingRateVisit = null;
    state.selectedRating = 0;
  } catch {
    ui.showToast("Couldn't save your review. Try again.");
    btn.disabled = false;
    btn.textContent = "Save review";
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
    ui.showToast("Rating saved");
    await refreshHistory();

    if (state.selectedRating >= 4) await autoUpdateTaste();

    state.pendingRateVisit = null;
    state.selectedRating = 0;
  } catch {
    ui.showToast("Couldn't save your rating. Try again.");
    btn.disabled = false;
    btn.textContent = "Save rating";
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

// ── SCROLLING ──────────────────────────────────────
// Brings results (or the review form) into view below the search area.
function scrollToResults() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById("main-content")
    .scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
