import type { Workout } from "./workout-api";

export function elapsedWorkoutSeconds(
  workout: Workout,
  serverNow: number,
): number | null {
  const saved = workout.duration_seconds;
  if (saved == null) return null;
  const running =
    workout.timer_started_at && !workout.is_finished
      ? Math.max(
          0,
          Math.floor((serverNow - Date.parse(workout.timer_started_at)) / 1000),
        )
      : 0;
  return Math.min(604800, saved + running);
}

export function durationLabel(seconds: number | null | undefined): string {
  if (seconds == null) return "Not tracked";
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
