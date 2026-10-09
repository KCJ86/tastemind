// ── THEME ──────────────────────────────────────────
// Loaded in <head> so the saved theme applies before the page paints.
// Three choices, cycled by the button in the top bar:
//   system → follows the device's light/dark setting (default)
//   light / dark → the user's explicit pick, remembered on this device
(function () {
  const KEY = "tm_theme";
  const ORDER = ["system", "light", "dark"];

  const ICONS = {
    system:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  };

  const LABELS = {
    system: "Theme: matching your device. Switch to light",
    light: "Theme: light. Switch to dark",
    dark: "Theme: dark. Switch to match your device",
  };

  // localStorage can throw (private mode, blocked storage), so guard it
  const read = () => {
    try {
      return localStorage.getItem(KEY) || "system";
    } catch {
      return "system";
    }
  };
  const write = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* not critical */
    }
  };

  // "system" removes the attribute so the CSS media query decides
  const apply = (theme) => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  };

  const renderButton = (theme) => {
    const btn = document.getElementById("theme-btn");
    if (!btn) return;
    btn.innerHTML = ICONS[theme];
    btn.setAttribute("aria-label", LABELS[theme]);
    btn.title = LABELS[theme].split(".")[0];
  };

  let current = read();
  apply(current);

  window.addEventListener("DOMContentLoaded", () => {
    renderButton(current);
    document.getElementById("theme-btn")?.addEventListener("click", () => {
      current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      write(current);
      apply(current);
      renderButton(current);
    });
  });
})();
