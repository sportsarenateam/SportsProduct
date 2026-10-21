export type Theme = "light" | "dark";

const STORAGE_KEY = "sportzarena-theme";

export function getTheme(): Theme {
  const applied = document.documentElement.getAttribute("data-theme");
  if (applied === "light" || applied === "dark") return applied;

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to read the saved theme preference:", error);
  }
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    console.warn("Unable to save the theme preference; the change applies for this session:", error);
  }
  window.dispatchEvent(new CustomEvent("sportzarena-theme", { detail: theme }));
  return theme;
}

export function toggleTheme(): Theme {
  const current = document.documentElement.getAttribute("data-theme");
  const theme = current === "dark" ? "dark" : getTheme();
  return setTheme(theme === "dark" ? "light" : "dark");
}

export function initTheme() {
  applyTheme(getTheme());
}

export function subscribeTheme(listener: (theme: Theme) => void) {
  const onCustom = (event: Event) => listener((event as CustomEvent<Theme>).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) {
      applyTheme(event.newValue);
      listener(event.newValue);
    }
  };
  window.addEventListener("sportzarena-theme", onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("sportzarena-theme", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
