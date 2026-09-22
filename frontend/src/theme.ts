import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "sand";
const storageKey = "longevity-theme";
const changeEvent = "longevity-theme-change";

function getTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "sand" ? value : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // The switch still works for this visit when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;
    document.documentElement.dataset.theme = parseTheme(event.newValue);
    onChange();
  }
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme);
}
