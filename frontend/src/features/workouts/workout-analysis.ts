import type {
  RecordSource,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "./workout-api";
import { estimatedMax } from "./workout-calculators";

export function formatProgressValue(value: number, unit: string): string {
  if (unit.startsWith("min/")) {
    const seconds = Math.round(value * 60);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} ${unit}`;
  }
  return `${value} ${unit}`;
}

export type ProgressMetric =
  | "estimated_1rm"
  | "max_weight"
  | "max_reps"
  | "max_volume"
  | "max_weight_reps"
  | "workout_volume"
  | "workout_reps"
  | "personal_records"
  | "max_distance"
  | "max_duration"
  | "max_speed"
  | "best_pace";

const metricOptions: {
  value: ProgressMetric;
  label: string;
  types: WorkoutExercise["tracking_type"][];
}[] = [
  { value: "estimated_1rm", label: "Estimated 1RM", types: ["strength"] },
  {
    value: "max_weight",
    label: "Max weight",
    types: ["strength", "bodyweight"],
  },
  { value: "max_reps", label: "Max reps", types: ["strength", "bodyweight"] },
  { value: "max_volume", label: "Max volume", types: ["strength"] },
  {
    value: "max_weight_reps",
    label: "Max weight for reps",
    types: ["strength"],
  },
  { value: "workout_volume", label: "Workout volume", types: ["strength"] },
  {
    value: "workout_reps",
    label: "Workout reps",
    types: ["strength", "bodyweight"],
  },
  { value: "personal_records", label: "Personal records", types: ["strength"] },
  { value: "max_distance", label: "Max distance", types: ["cardio"] },
  {
    value: "max_duration",
    label: "Max duration",
    types: ["cardio", "duration"],
  },
  { value: "max_speed", label: "Max speed", types: ["cardio"] },
  { value: "best_pace", label: "Best pace", types: ["cardio"] },
];

export function progressMetrics(types: WorkoutExercise["tracking_type"][]) {
  return metricOptions.filter((option) =>
    option.types.some((type) => types.includes(type)),
  );
}

export interface ProgressSeries {
  key: string;
  title: string;
  unit: string;
  points: {
    date: string;
    value: number;
    session?: string;
    source?: { weight: string; reps: number };
  }[];
  records: {
    label: string;
    value: number;
    unit: string;
    date: string;
    source?: RecordSource;
  }[];
}

// Recomputed from completed snapshots; never mix types/units or cache stale PRs.
export function progressSeries(
  sessions: Workout[],
  exerciseId: string,
  metricChoice?: ProgressMetric,
  repCount = 5,
): ProgressSeries[] {
  const groups = new Map<
    string,
    {
      series: ProgressSeries;
      points: Map<string, ProgressSeries["points"][number]>;
      records: Map<string, ProgressSeries["records"][number]>;
    }
  >();
  const total =
    metricChoice === "workout_volume" || metricChoice === "workout_reps";
  for (const workout of [...sessions].sort((a, b) =>
    a.performed_on.localeCompare(b.performed_on),
  )) {
    for (const item of workout.exercises.filter(
      (i) => i.exercise_id === exerciseId,
    )) {
      const choice = metricChoice ?? defaultMetric(item.tracking_type);
      const key = `${item.tracking_type}:${item.weight_unit}:${item.distance_unit}`;
      for (const set of item.sets.filter((s) => s.is_completed)) {
        const measured = measure(item, set, choice, repCount);
        if (!measured || !Number.isFinite(measured.value)) continue;
        const { value, title, unit } = measured;
        if (!groups.has(key))
          groups.set(key, {
            series: { key, title, unit, points: [], records: [] },
            points: new Map(),
            records: new Map(),
          });
        const group = groups.get(key)!;
        const pointKey = total ? workout.id : workout.performed_on;
        const previous = group.points.get(pointKey);
        const source =
          choice === "estimated_1rm" && set.weight !== null && set.reps !== null
            ? { weight: set.weight, reps: set.reps }
            : undefined;
        const winningSource =
          previous && previous.value >= value ? previous.source : source;
        const aggregate = total
          ? Number(
              ((group.points.get(pointKey)?.value ?? 0) + value).toFixed(3),
            )
          : choice === "best_pace"
            ? Math.min(previous?.value ?? Infinity, value)
            : Math.max(previous?.value ?? -Infinity, value);
        group.points.set(pointKey, {
          date: workout.performed_on,
          value: aggregate,
          ...(total ? { session: workout.name || "Workout" } : {}),
          ...(winningSource ? { source: winningSource } : {}),
        });
        const perRep =
          item.tracking_type === "strength" &&
          (choice === "max_weight" ||
            choice === "max_weight_reps" ||
            choice === "personal_records");
        const label = perRep ? `${set.reps} reps` : title;
        const recordValue = total ? aggregate : value;
        const previousRecord = group.records.get(label);
        if (
          !previousRecord ||
          (choice === "best_pace"
            ? recordValue < previousRecord.value
            : recordValue > previousRecord.value)
        )
          group.records.set(label, {
            label,
            value: recordValue,
            unit,
            date: workout.performed_on,
          });
      }
    }
  }
  return [...groups.values()].map((g) => ({
    ...g.series,
    points: [...g.points.values()],
    records: [...g.records.values()],
  }));
}

export function defaultMetric(
  type: WorkoutExercise["tracking_type"],
): ProgressMetric {
  return type === "strength"
    ? "max_weight"
    : type === "bodyweight"
      ? "max_reps"
      : type === "cardio"
        ? "max_distance"
        : "max_duration";
}

function measure(
  item: WorkoutExercise,
  set: WorkoutSet,
  choice: ProgressMetric,
  reps: number,
) {
  if (
    !progressMetrics([item.tracking_type]).some(
      (option) => option.value === choice,
    )
  )
    return null;
  const weight = set.weight === null ? null : Number(set.weight);
  const volumeUnit = `${item.weight_unit}·reps`;
  switch (choice) {
    case "max_speed":
    case "best_pace": {
      const distance = set.distance === null ? 0 : Number(set.distance);
      const duration = set.duration_seconds ?? 0;
      if (
        !Number.isFinite(distance) ||
        !Number.isFinite(duration) ||
        distance <= 0 ||
        duration <= 0
      )
        return null;
      return {
        value: Number(
          (choice === "max_speed"
            ? (distance * 3600) / duration
            : duration / (distance * 60)
          ).toFixed(3),
        ),
        title:
          choice === "max_speed"
            ? "Fastest logged speed"
            : "Best logged pace (lower is faster)",
        unit:
          choice === "max_speed"
            ? `${item.distance_unit}/h`
            : `min/${item.distance_unit}`,
      };
    }
    case "estimated_1rm":
      if (
        weight === null ||
        !Number.isFinite(weight) ||
        weight <= 0 ||
        weight > 10000 ||
        set.reps === null ||
        !Number.isInteger(set.reps) ||
        set.reps < 1 ||
        set.reps > 10
      )
        return null;
      return {
        value: Number(estimatedMax(weight, set.reps).toFixed(3)),
        title: "Estimated 1RM",
        unit: item.weight_unit,
      };
    case "max_volume":
    case "workout_volume":
      return weight === null || set.reps === null
        ? null
        : {
            value: weight * set.reps,
            title: choice === "max_volume" ? "Max volume" : "Workout volume",
            unit: volumeUnit,
          };
    case "max_reps":
    case "workout_reps":
      return set.reps === null
        ? null
        : {
            value: set.reps,
            title:
              choice === "workout_reps"
                ? "Workout reps"
                : item.tracking_type === "bodyweight"
                  ? `Highest logged reps (external load ${item.weight_unit} may vary)`
                  : "Max reps",
            unit: "reps",
          };
    case "max_weight":
    case "max_weight_reps":
    case "personal_records":
      if (
        weight === null ||
        (choice === "max_weight_reps" && set.reps !== reps)
      )
        return null;
      return {
        value: weight,
        title:
          choice === "personal_records"
            ? "Personal records in this window"
            : choice === "max_weight_reps"
              ? `Max weight for ${reps} reps`
              : item.tracking_type === "bodyweight"
                ? "Highest external load (body weight not included)"
                : "Highest logged load",
        unit: item.weight_unit,
      };
    case "max_distance":
      return set.distance === null
        ? null
        : {
            value: Number(set.distance),
            title: "Longest logged distance",
            unit: item.distance_unit,
          };
    case "max_duration":
      return set.duration_seconds === null
        ? null
        : {
            value: set.duration_seconds,
            title: "Longest logged duration",
            unit: "sec",
          };
  }
}
