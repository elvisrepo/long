const staticTitles: Record<string, string> = {
  "/": "Dashboard",
  "/analytics/consistency": "Consistency",
  "/analytics/sleep": "Sleep insights",
  "/analytics/weight-steps": "Weight & steps",
  "/diet": "Diet",
  "/forgot-password": "Forgot password",
  "/login": "Login",
  "/metrics": "Metrics",
  "/recovery": "Recovery",
  "/register": "Create account",
  "/reset-password": "Reset password",
  "/settings": "Settings",
  "/stretching": "Stretching & Posture",
};

const workoutTitles: Record<string, string> = {
  calendar: "Workout calendar",
  exercises: "All exercises",
  history: "Workout history",
  home: "Workouts",
  overview: "Exercise overview",
  progress: "Workout progress",
  routines: "Workout routines",
  training: "Workout training",
};

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getDocumentTitle(
  pathname: string,
  search: Readonly<Record<string, unknown>> = {},
): string {
  let title = staticTitles[pathname];

  if (pathname === "/workouts") {
    const view = typeof search.view === "string" ? search.view : "home";
    title = workoutTitles[view] ?? "Workouts";
  } else if (pathname.startsWith("/metrics/")) {
    title = titleCase(pathname.slice("/metrics/".length));
  }

  return `${title ?? "Page not found"} · Longevity`;
}
