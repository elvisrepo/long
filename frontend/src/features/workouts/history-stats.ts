import type { WorkoutExercise, WorkoutSet } from "./workout-api";
import { estimatedMax } from "./workout-calculators";

export type HistoryStat = { label: string; value: string };
const number = (value: number) => String(Number(value.toFixed(3)));
const durationLabel = (seconds: number) => {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
};
export function historySetStats(
  item: WorkoutExercise,
  set: WorkoutSet,
): HistoryStat[] {
  const stats: HistoryStat[] = [];
  if (item.tracking_type === "strength") {
    try {
      stats.push({
        label: "Estimated 1RM",
        value: `${estimatedMax(Number(set.weight), set.reps ?? 0).toFixed(1)} ${item.weight_unit}`,
      });
    } catch {
      /* A complete eligible lift is needed. */
    }
  }
  if (
    (item.tracking_type === "strength" ||
      item.tracking_type === "bodyweight") &&
    set.weight !== null &&
    set.reps !== null
  )
    stats.push({
      label:
        item.tracking_type === "bodyweight"
          ? "External load volume"
          : "Total volume",
      value: `${number(Number(set.weight) * set.reps)} ${item.weight_unit}·reps`,
    });
  if (
    item.tracking_type === "cardio" &&
    Number(set.distance) > 0 &&
    (set.duration_seconds ?? 0) > 0
  ) {
    const distance = Number(set.distance),
      seconds = set.duration_seconds!;
    stats.push(
      {
        label: "Speed",
        value: `${number((distance * 3600) / seconds)} ${item.distance_unit}/h`,
      },
      {
        label: "Pace",
        value: `${durationLabel(seconds / distance)} min/${item.distance_unit}`,
      },
    );
  }
  if (item.tracking_type === "duration" && set.duration_seconds !== null)
    stats.push({ label: "Duration", value: `${set.duration_seconds} seconds` });
  return stats;
}
export function historyWorkoutStats(
  items: WorkoutExercise[],
): { unit: string; stats: HistoryStat[] }[] {
  const groups = new Map<string, WorkoutExercise[]>();
  for (const item of items) {
    const key = `${item.tracking_type} · ${item.weight_unit} · ${item.distance_unit}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([unit, rows]) => {
    const item = rows[0],
      sets = rows.flatMap((row) => row.sets).filter((set) => set.is_completed);
    const stats: HistoryStat[] = [];
    if (
      item.tracking_type === "strength" ||
      item.tracking_type === "bodyweight"
    ) {
      if (sets.some((set) => set.weight !== null && set.reps !== null))
        stats.push({
          label:
            item.tracking_type === "bodyweight"
              ? "External load volume"
              : "Total volume",
          value: `${number(sets.reduce((sum, set) => sum + Number(set.weight ?? 0) * (set.reps ?? 0), 0))} ${item.weight_unit}·reps`,
        });
      stats.push({
        label: "Total reps",
        value: `${sets.reduce((sum, set) => sum + (set.reps ?? 0), 0)} reps`,
      });
    } else {
      if (item.tracking_type === "cardio")
        stats.push({
          label: "Total distance",
          value: `${number(sets.reduce((sum, set) => sum + Number(set.distance ?? 0), 0))} ${item.distance_unit}`,
        });
      stats.push({
        label: "Total duration",
        value: `${sets.reduce((sum, set) => sum + (set.duration_seconds ?? 0), 0)} seconds`,
      });
    }
    return { unit, stats };
  });
}
