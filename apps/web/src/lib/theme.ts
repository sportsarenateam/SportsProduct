export type Theme = "light" | "dark";

const STORAGE_KEY = "sportzarena-theme";

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent("sportzarena-theme", { detail: theme }));
  return theme;
}

export function toggleTheme(): Theme {
  return setTheme(getTheme() === "dark" ? "light" : "dark");
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
