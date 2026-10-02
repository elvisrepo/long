import type { WorkoutExercise, WorkoutSet } from "./workout-api";

export type WorkoutView =
  | "home"
  | "exercises"
  | "training"
  | "history"
  | "routines"
  | "calendar"
  | "progress"
  | "overview";
// Exercise overview also uses the owned library UUID, never a session occurrence.
// Calendar is a month read; Progress uses the owned library exercise parameter.
export interface WorkoutSearch {
  view?: WorkoutView;
  date?: string;
  session?: string;
  exercise?: string;
}
export type RunAction = (action: () => Promise<void>) => void;
export type NavigateWorkout = (search: WorkoutSearch) => void;
export function nextGroupedExercise<
  T extends { id: string; group_name?: string },
>(items: T[], currentId: string): T | undefined {
  const current = items.find((i) => i.id === currentId);
  if (!current?.group_name) return;
  const group = items.filter((i) => i.group_name === current.group_name);
  if (group.length < 2) return;
  return group[(group.findIndex((i) => i.id === currentId) + 1) % group.length];
}
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localDay(date);
}
export function dayLabel(day: string): string {
  return new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function parseWorkoutSearch(
  raw: Record<string, unknown>,
): WorkoutSearch {
  const result: WorkoutSearch = {};
  if (
    [
      "home",
      "exercises",
      "training",
      "history",
      "routines",
      "calendar",
      "progress",
      "overview",
    ].includes(String(raw.view))
  )
    result.view = raw.view as WorkoutView;
  if (
    typeof raw.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(raw.date) &&
    localDay(new Date(raw.date + "T12:00:00")) === raw.date
  )
    result.date = raw.date;
  for (const key of ["session", "exercise"] as const)
    if (
      typeof raw[key] === "string" &&
      /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(raw[key])
    )
      result[key] = raw[key];
  if (result.view === "training" && (!result.session || !result.exercise))
    result.view = "home";
  return result;
}
export function setLabel(
  item: Pick<
    WorkoutExercise,
    "tracking_type" | "weight_unit" | "distance_unit"
  >,
  set: Pick<WorkoutSet, "weight" | "reps" | "distance" | "duration_seconds">,
): string {
  if (item.tracking_type === "duration")
    return set.duration_seconds == null
      ? "Duration not set"
      : `${set.duration_seconds} sec`;
  if (item.tracking_type === "cardio")
    return `${set.distance ?? "—"} ${item.distance_unit} · ${set.duration_seconds ?? "—"} sec`;
  return `${set.weight == null ? "" : Number(set.weight) + " " + item.weight_unit + " · "}${set.reps ?? "—"} reps`;
}
