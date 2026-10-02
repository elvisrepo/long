import type { Workout, WorkoutExercise } from "./workout-api";

export interface ProgressSeries {
  key: string;
  title: string;
  unit: string;
  points: { date: string; value: number }[];
  records: { label: string; value: number; unit: string; date: string }[];
}

// Recomputed from saved rows after every query invalidation; no stale PR cache.
export function progressSeries(
  sessions: Workout[],
  exerciseId: string,
): ProgressSeries[] {
  const groups = new Map<
    string,
    {
      series: ProgressSeries;
      daily: Map<string, number>;
      records: Map<string, ProgressSeries["records"][number]>;
    }
  >();
  for (const workout of [...sessions].sort((a, b) =>
    a.performed_on.localeCompare(b.performed_on),
  )) {
    for (const item of workout.exercises.filter(
      (i) => i.exercise_id === exerciseId,
    )) {
      const key = `${item.tracking_type}:${item.weight_unit}:${item.distance_unit}`;
      for (const set of item.sets.filter((s) => s.is_completed)) {
        const metric = measuredMetric(item);
        const value =
          metric.field === "weight"
            ? set.weight === null
              ? null
              : Number(set.weight)
            : metric.field === "distance"
              ? set.distance === null
                ? null
                : Number(set.distance)
              : set[metric.field];
        if (value === null || !Number.isFinite(value)) continue;
        if (!groups.has(key))
          groups.set(key, {
            series: {
              key,
              title: metric.title,
              unit: metric.unit,
              points: [],
              records: [],
            },
            daily: new Map(),
            records: new Map(),
          });
        const group = groups.get(key)!;
        group.daily.set(
          workout.performed_on,
          Math.max(group.daily.get(workout.performed_on) ?? -Infinity, value),
        );
        const label =
          item.tracking_type === "strength" ? `${set.reps} reps` : metric.title;
        if (value > (group.records.get(label)?.value ?? -Infinity))
          group.records.set(label, {
            label,
            value,
            unit: metric.unit,
            date: workout.performed_on,
          });
      }
    }
  }
  return [...groups.values()].map((g) => ({
    ...g.series,
    points: [...g.daily].map(([date, value]) => ({ date, value })),
    records: [...g.records.values()],
  }));
}
function measuredMetric(item: WorkoutExercise): {
  field: "weight" | "reps" | "distance" | "duration_seconds";
  unit: string;
  title: string;
} {
  if (item.tracking_type === "strength")
    return {
      field: "weight",
      unit: item.weight_unit,
      title: "Highest logged load",
    };
  if (item.tracking_type === "bodyweight")
    return {
      field: "reps",
      unit: "reps",
      title: `Highest logged reps (external load ${item.weight_unit} may vary)`,
    };
  if (item.tracking_type === "cardio")
    return {
      field: "distance",
      unit: item.distance_unit,
      title: "Longest logged distance",
    };
  return {
    field: "duration_seconds",
    unit: "sec",
    title: "Longest logged duration",
  };
}
