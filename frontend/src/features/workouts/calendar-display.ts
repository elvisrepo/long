import { useSyncExternalStore } from "react";
export interface CalendarDisplay {
  mode: "month" | "list";
  panel: boolean;
  dots: boolean;
  categoryNames: boolean;
  sets: boolean;
}
export const defaultCalendarDisplay = (): CalendarDisplay => ({
  mode: "month",
  panel: false,
  dots: true,
  categoryNames: false,
  sets: false,
});
export function readCalendarDisplay(owner: string): CalendarDisplay {
  const fallback = defaultCalendarDisplay();
  try {
    const value = JSON.parse(
      localStorage.getItem(`longevity:calendar:${owner}`) ?? "null",
    );
    if (!value || typeof value !== "object") return fallback;
    return {
      mode: value.mode === "list" ? "list" : "month",
      panel: typeof value.panel === "boolean" ? value.panel : fallback.panel,
      dots: typeof value.dots === "boolean" ? value.dots : fallback.dots,
      categoryNames:
        typeof value.categoryNames === "boolean"
          ? value.categoryNames
          : fallback.categoryNames,
      sets: typeof value.sets === "boolean" ? value.sets : fallback.sets,
    };
  } catch {
    return fallback;
  }
}
export function saveCalendarDisplay(
  owner: string,
  value: CalendarDisplay,
): void {
  try {
    localStorage.setItem(`longevity:calendar:${owner}`, JSON.stringify(value));
  } catch {
    /* Preferences remain usable without storage. */
  }
}
const wideQuery = "(min-width: 960px)";
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(wideQuery);
  media?.addEventListener?.("change", listener);
  return () => media?.removeEventListener?.("change", listener);
}
export function useWideCalendar() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(wideQuery).matches ?? false,
    () => false,
  );
}
