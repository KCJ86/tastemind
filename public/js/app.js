// ── APP LAYER ──────────────────────────────────────
// Main state, event handlers, and orchestration.
// Connects api.js and ui.js together.

// ── STATE ──────────────────────────────────────────
const state = {
  currentUser: null,
  selectedRating: 0,
  pendingRateVisit: null,
};

// ── INIT ───────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  bindStaticEvents();

  // Auto-login if user code saved in localStorage
  const savedCode = localStorage.getItem("tm_user_code");
  if (savedCode) fetchAndEnterApp(savedCode);
});

// ── STATIC EVENT BINDINGS ──────────────────────────
// Only for elements that exist on page load
function bindStaticEvents() {
  // Onboarding
  document
    .getElementById("create-user-btn")
    .addEventListener("click", handleCreateUser);
  document
    .getElementById("load-user-btn")
    .addEventListener("click", handleLoadUser);
  document.getElementById("returning-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLoadUser();
  });

  // Craving input
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

document.addEventListener("click", (e) => {
  console.log("clicked:", e.target.id, e.target.className);

  // Save restaurant button
  const saveBtn = e.target.closest(".card-save-btn");
  if (saveBtn && !saveBtn.disabled) {
    const data = JSON.parse(decodeURIComponent(saveBtn.dataset.restaurant));
    handleSaveVisit(data, saveBtn);
    return;
  }

  // History item — open rate modal
  const historyItem = e.target.closest(".history-item");
  if (historyItem) {
    const { visitId, visitName } = historyItem.dataset;
    openRatingModal(parseInt(visitId), visitName);
    return;
  }

  // Star rating
  const star = e.target.closest(".star");
  if (star) {
    state.selectedRating = parseInt(star.dataset.value);
    ui.updateStars(state.selectedRating);
    document.getElementById("modal-confirm-btn").disabled = false;
    return;
  }

  // Modal confirm
  const modalConfirm = e.target.closest("#modal-confirm-btn");
  if (modalConfirm) {
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

  // Copy user code — must be before user-pill toggle
  if (e.target.closest("#copy-code-btn")) {
    navigator.clipboard.writeText(state.currentUser.user_code);
    ui.showToast("Code copied to clipboard! ✦", "gold");
    return;
  }

  // Go home — must be before user-pill toggle
  if (e.target.closest("#dropdown-home")) {
    document.getElementById("user-dropdown").style.display = "none";
    ui.showScreen("onboard");
    return;
  }

  // Sign out — must be before user-pill toggle
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

  // Toggle user dropdown — must be after all dropdown item handlers
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
// Star hover effects
document.addEventListener("mouseover", (e) => {
  const star = e.target.closest(".star");
  if (star) ui.updateStars(parseInt(star.dataset.value));
});

document.addEventListener("mouseout", (e) => {
  const star = e.target.closest(".star");
  if (star) ui.updateStars(state.selectedRating);
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
  });
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
    );

    clearInterval(stepInterval);

    if (!data.success) throw new Error();
    ui.renderRecommendations(data, handleSaveVisit);
  } catch {
    clearInterval(stepInterval);
    ui.renderError();
  } finally {
    btn.disabled = false;
  }
}

// ── SAVE VISIT ─────────────────────────────────────
async function handleSaveVisit(restaurant, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving…";
  }

  try {
    const data = await api.saveVisit(state.currentUser.user_code, restaurant);

    if (!data.success) throw new Error();

    if (btn) {
      btn.textContent = "✓ Saved!";
      btn.classList.add("saved");
    }

    state.pendingRateVisit = {
      visit_id: data.visit_id,
      name: restaurant.restaurant_name,
    };
    await refreshHistory();

    // Auto prompt rating after short delay
    setTimeout(() => {
      openRatingModal(data.visit_id, restaurant.restaurant_name);
    }, 1000);
  } catch {
    ui.showToast("Could not save visit");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "I'm going here →";
    }
  }
}

// ── RATING ─────────────────────────────────────────
function openRatingModal(visit_id, name) {
  state.selectedRating = 0;
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

    // If rated highly auto update liked cuisines
    if (state.selectedRating >= 4 && state.pendingRateVisit) {
      await autoUpdateTaste();
    }

    state.pendingRateVisit = null;
    state.selectedRating = 0;
  } catch {
    ui.showToast("Could not save rating");
    btn.disabled = false;
    btn.textContent = "Save rating →";
  }
}

// Auto update taste profile when user rates something 4 or 5 stars
async function autoUpdateTaste() {
  try {
    const visitsData = await api.getVisits(state.currentUser.user_code);
    const visits = visitsData.visits || [];

    // Pull cuisines from highly rated visits
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

      // Refresh user data so taste tags update
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

function handleRatePrompt() {
  if (!state.pendingRateVisit) {
    ui.showToast("Go visit a restaurant first! 🍽️");
    return;
  }
  openRatingModal(state.pendingRateVisit.visit_id, state.pendingRateVisit.name);
}
