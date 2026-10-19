// ── APP LAYER ──────────────────────────────────────
// Main state, event handlers, and orchestration.

// ── STATE ──────────────────────────────────────────
const state = {
  currentUser: null,
  selectedRating: 0,
  pendingRateVisit: null,
  searchRadius: 10,
  priceLevels: loadBudget(), // [] means any price
};

// Left in localStorage by the pre-accounts version of the app (a sign-in
// code and one shared pending list). Nothing reads them; they're cleared.
const OLD_STORAGE_KEYS = ["tm_user_code", "tm_pending"];

// ── INIT ───────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  bindStaticEvents();
  renderBudget();
  paintRadius();
  api.onUnauthorized = handleSessionEnded;
  OLD_STORAGE_KEYS.forEach(removeStorage);

  // Nothing is shown until we know whether there's a session, so neither
  // the sign-in screen nor the app flashes on load.
  try {
    const data = await api.me();
    if (data.success) return enterApp(data.user);
  } catch {
    /* offline or server down: fall through to sign-in */
  }
  showSignIn();
});

// ── STATIC EVENT BINDINGS ──────────────────────────
function bindStaticEvents() {
  document.getElementById("form-signin").addEventListener("submit", handleSignIn);
  document.getElementById("form-signup").addEventListener("submit", handleSignUp);
  bindAuthTabs();
  document.querySelectorAll(".reveal-btn").forEach((btn) => {
    ui.setPasswordVisible(btn, false);
    btn.addEventListener("click", () =>
      ui.setPasswordVisible(btn, btn.getAttribute("aria-pressed") !== "true"),
    );
  });
  bindLocationEvents();

  document.getElementById("radius-slider").addEventListener("input", (e) => {
    const val = e.target.value;
    document.getElementById("radius-value").textContent = `${val} miles`;
    state.searchRadius = parseInt(val);
    paintRadius();
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

  // Budget buttons — "Any" clears; a $ level toggles on or off
  const budgetBtn = e.target.closest(".budget-btn");
  if (budgetBtn) {
    const level = parseInt(budgetBtn.dataset.level);
    if (level === 0) {
      state.priceLevels = [];
    } else if (state.priceLevels.includes(level)) {
      state.priceLevels = state.priceLevels.filter((l) => l !== level);
    } else {
      state.priceLevels = [...state.priceLevels, level].sort();
    }
    saveBudget();
    renderBudget();
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

  // Sign out
  if (e.target.closest("#dropdown-signout")) {
    handleSignOut();
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
// Bound once at startup (not on every sign-in, which stacked duplicate
// listeners) and always reads the current user.
function bindLocationEvents() {
  document
    .getElementById("location-edit-btn")
    ?.addEventListener("click", () => {
      document.getElementById("location-display").style.display = "none";
      document.getElementById("location-edit").style.display = "flex"; // flex, so the CSS gap spaces the field and buttons
      const input = document.getElementById("location-input");
      input.value = state.currentUser?.location || "";
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

  // Reset the button so the panel is fresh the next time it opens,
  // however it was closed (saved, cancelled, or Escape)
  const btn = document.getElementById("location-save-btn");
  btn.disabled = false;
  btn.textContent = "Update location";
}

async function handleSaveLocation() {
  const input = document.getElementById("location-input").value.trim();
  if (!input) return;

  const btn = document.getElementById("location-save-btn");
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const data = await api.updateLocation(input);

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

// ── SIGN-IN SCREEN ─────────────────────────────────
const AUTH_TABS = ["signin", "signup"];

// Arrow keys move between tabs (the ARIA tabs pattern); Tab moves into the form.
function bindAuthTabs() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => ui.selectAuthTab(tab.id.replace("tab-", "")));
    tab.addEventListener("keydown", (e) => {
      const i = AUTH_TABS.indexOf(tab.id.replace("tab-", ""));
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: AUTH_TABS.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      ui.selectAuthTab(AUTH_TABS[(next + AUTH_TABS.length) % AUTH_TABS.length], { focus: true });
    });
  });
}

function showSignIn() {
  ui.selectAuthTab("signin");
  ui.showScreen("onboard");
}

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

// Mirrors the server's rules so most mistakes show up without a round trip.
// The server still checks everything.
function checkNewAccountFields(form) {
  const errors = {};
  const username = form.elements.username.value.trim().toLowerCase();
  const password = form.elements.password.value;
  if (!USERNAME_RE.test(username)) {
    errors.username = "Use 3 to 30 letters, numbers, underscores or dots.";
  }
  if (password.length < 10) {
    errors.password = "Password must be at least 10 characters.";
  } else if (new TextEncoder().encode(password).length > 72) {
    errors.password = "That password is too long. Use 72 characters or fewer.";
  }
  const email = form.elements.email?.value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "That doesn't look like an email address.";
  }
  return errors;
}

// An empty field just says "Required." rather than repeating its format hint.
function requireFields(form, names, errors) {
  for (const name of names) {
    if (!form.elements[name].value.trim()) errors[name] = "Required.";
  }
  return errors;
}

function showErrors(form, errors) {
  for (const [field, message] of Object.entries(errors)) {
    ui.setFieldError(form, field, message);
  }
  ui.focusFirstError(form);
}

// Turns an API response into inline errors. Each form passes the messages
// that are specific to it (e.g. what a 401 means there).
function showApiError(form, data, messages = {}) {
  if (data.status === 400 && Array.isArray(data.errors)) {
    const seen = new Set();
    for (const err of data.errors) {
      if (seen.has(err.path)) continue;
      seen.add(err.path);
      ui.setFieldError(form, err.path, err.msg === "Invalid value" ? "Check this field." : err.msg);
    }
  } else if (data.status === 409) {
    const field = /email/i.test(data.error) ? "email" : "username";
    ui.setFieldError(form, field, `${data.error}.`);
  } else if (messages[data.status]) {
    const { field, text } = messages[data.status];
    if (field) ui.setFieldError(form, field, text);
    else ui.setFormError(form, text);
  } else if (data.status === 429) {
    ui.setFormError(form, data.error || "Too many attempts. Try again later.");
  } else {
    ui.setFormError(form, "Something went wrong. Try again.");
  }
  ui.focusFirstError(form);
}

// Shared by all three forms: clear old errors, validate, call the API,
// then either enter the app or show what went wrong.
async function submitAuthForm(form, { errors, busyLabel, call, messages, onSuccess }) {
  ui.clearAuthErrors(form);
  if (Object.keys(errors).length) return showErrors(form, errors);

  ui.setBusy(form, true, busyLabel);
  try {
    const data = await call();
    if (!data.success) return showApiError(form, data, messages);
    // Hide passwords again so a manager saving the form sees a password field
    form.querySelectorAll(".reveal-btn").forEach((btn) => ui.setPasswordVisible(btn, false));
    onSuccess(data.user);
  } catch {
    ui.setFormError(form, "Couldn't reach TasteMind. Check your connection and try again.");
    ui.focusFirstError(form);
  } finally {
    ui.setBusy(form, false);
  }
}

function handleSignIn(e) {
  e.preventDefault();
  const form = e.currentTarget;
  submitAuthForm(form, {
    errors: requireFields(form, ["username", "password"], {}),
    busyLabel: "Signing in…",
    call: () => api.login(form.elements.username.value.trim(), form.elements.password.value),
    messages: { 401: { text: "Wrong username or password." } },
    onSuccess: enterApp,
  });
}

function handleSignUp(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const value = (name) => form.elements[name].value.trim();
  submitAuthForm(form, {
    errors: requireFields(form, ["name", "username", "password", "location"], checkNewAccountFields(form)),
    busyLabel: "Creating your account…",
    call: () =>
      api.signup({
        name: value("name"),
        username: value("username"),
        password: form.elements.password.value,
        location: value("location"),
        email: value("email") || undefined,
      }),
    onSuccess: (user) => {
      enterApp(user);
      ui.showToast(`Welcome, ${user.name}`);
    },
  });
}

async function handleSignOut() {
  try {
    await api.logout();
  } catch {
    /* the local sign-out below still happens */
  }
  leaveApp();
  ui.showToast("Signed out");
}

// The server rejected our session (expired, or signed out elsewhere).
function handleSessionEnded() {
  if (!state.currentUser) return;
  leaveApp();
  ui.showToast("Your session ended. Sign in again.");
}

function enterApp(user) {
  state.currentUser = user;
  document.querySelectorAll(".auth-form").forEach((form) => {
    form.reset();
    ui.clearAuthErrors(form);
  });
  ui.showScreen("app");
  document.body.classList.add("app-active");
  ui.renderLocation(user.location);
  refreshHistory().then((visits) => {
    ui.renderHeader(state.currentUser, visits ? visits.length : 0);
    ui.renderTasteTags(state.currentUser);
    renderSidebar();
  });
}

function leaveApp() {
  document.body.classList.remove("app-active");
  state.currentUser = null;
  state.selectedRating = 0;
  state.pendingRateVisit = null;
  restaurantStore.clear();
  ui.clearHeader();
  ui.closeDrawer();
  ui.closeModal();
  closeLocationEdit();
  ui.renderEmpty();
  document.getElementById("review-prompt").innerHTML = "";
  document.getElementById("history-list").innerHTML = "";
  document.getElementById("taste-tags").innerHTML = "";
  document.getElementById("craving-input").value = "";
  ui.selectAuthTab("signin");
  ui.showScreen("onboard");
}

// ── STORAGE ────────────────────────────────────────
// localStorage can throw (private mode, storage disabled); none of this is
// critical, so failures are ignored.
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not critical */
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* not critical */
  }
}

// ── PENDING VISITS ─────────────────────────────────
// Meals saved with "I'm going here" but not reviewed yet. Kept on this
// device, per user, so two people sharing a browser don't see each other's.
const pendingKey = (userId) => `tm_pending_${userId}`;

function readPending(key) {
  try {
    const list = JSON.parse(readStorage(key) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function getPending() {
  if (!state.currentUser) return [];
  return readPending(pendingKey(state.currentUser.id));
}

function savePending(list) {
  writeStorage(pendingKey(state.currentUser.id), JSON.stringify(list));
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
    const data = await api.getVisits();
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
      craving,
      null,
      state.searchRadius,
      state.priceLevels,
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
    const visitData = await api.saveVisit(restaurant);
    if (!visitData.success) throw new Error();

    // 2. Save rating right after
    const ratingData = await api.rateVisit(
      visitData.visit_id,
      state.selectedRating,
      notes,
    );
    if (!ratingData.success) throw new Error();

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
    const visitsData = await api.getVisits();
    const visits = visitsData.visits || [];

    const liked = [
      ...new Set(
        visits
          .filter((v) => v.rating >= 4 && v.cuisine_type)
          .map((v) => v.cuisine_type),
      ),
    ];

    if (liked.length > 0) {
      await api.updateTaste({ liked_cuisines: liked });
      const userData = await api.me();
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

// ── BUDGET ─────────────────────────────────────────
// Remembered on this device so users don't re-pick it every search.
function loadBudget() {
  try {
    const saved = JSON.parse(localStorage.getItem("tm_budget") || "[]");
    return Array.isArray(saved)
      ? saved.filter((n) => Number.isInteger(n) && n >= 1 && n <= 4)
      : [];
  } catch {
    return [];
  }
}

function saveBudget() {
  try {
    localStorage.setItem("tm_budget", JSON.stringify(state.priceLevels));
  } catch {
    /* not critical */
  }
}

function renderBudget() {
  document.querySelectorAll(".budget-btn").forEach((btn) => {
    const level = parseInt(btn.dataset.level);
    const on =
      level === 0
        ? state.priceLevels.length === 0
        : state.priceLevels.includes(level);
    btn.setAttribute("aria-pressed", String(on));
  });
}

// ── RADIUS SLIDER ──────────────────────────────────
// Fills the track up to the thumb so the current value is easy to see.
function paintRadius() {
  const slider = document.getElementById("radius-slider");
  const pct =
    ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--pct", `${pct}%`);
}
