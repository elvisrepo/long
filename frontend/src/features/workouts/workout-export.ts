import type { Workout } from "./workout-api";
import { setLabel } from "./workout-navigation";

// Quoting handles CSV structure; the apostrophe prevents spreadsheet formulas.
function cell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  let index = 0;
  while (
    index < text.length &&
    (text.charCodeAt(index) <= 32 || /\s/.test(text[index]))
  )
    index++;
  const safe =
    /^[=+@-]/.test(text.slice(index)) || /^[\t\r\n]/.test(text)
      ? "'" + text
      : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function workoutCsv(workout: Workout, includeNotes = false): string {
  const rows: (string | number | null | undefined)[][] = [
    [
      "Date",
      "Workout",
      "Session status",
      "Session notes",
      "Duration seconds",
      "Timer state",
      "Exercise position",
      "Exercise",
      "Category",
      "Tracking type",
      "Group",
      "Set position",
      "Weight",
      "Weight unit",
      "Reps",
      "Distance",
      "Distance unit",
      "Duration seconds",
      "Set status",
      "Set comment",
    ],
  ];
  const base = [
    workout.performed_on,
    workout.name,
    workout.is_finished ? "Finished" : "In progress",
    includeNotes ? workout.notes : "",
    workout.elapsed_seconds ?? workout.duration_seconds ?? null,
    workout.timer_started_at
      ? "Running"
      : workout.duration_seconds == null
        ? "Not tracked"
        : "Paused",
  ];
  if (!workout.exercises.length) rows.push(base);
  workout.exercises.forEach((item, index) => {
    const prefix = [
      ...base,
      index + 1,
      item.exercise_name,
      item.category_name,
      item.tracking_type,
      item.group_name ?? "",
    ];
    if (!item.sets.length)
      rows.push([
        ...prefix,
        "",
        "",
        item.weight_unit,
        "",
        "",
        item.distance_unit,
        "",
        "No sets",
        "",
      ]);
    item.sets.forEach((set, position) =>
      rows.push([
        ...prefix,
        position + 1,
        set.weight,
        item.weight_unit,
        set.reps,
        set.distance,
        item.distance_unit,
        set.duration_seconds,
        set.is_completed ? "Completed" : "Planned",
        includeNotes ? set.comment : "",
      ]),
    );
  });
  return (
    rows
      .map((row) =>
        Array.from({ length: rows[0].length }, (_, index) =>
          cell(row[index]),
        ).join(","),
      )
      .join("\r\n") + "\r\n"
  );
}

export function workoutSummary(workout: Workout, includeNotes = false): string {
  const lines = [
    `${workout.performed_on} · ${workout.name}`,
    workout.is_finished ? "Finished" : "In progress",
  ];
  const duration = workout.elapsed_seconds ?? workout.duration_seconds;
  lines.push(
    `Duration: ${duration == null ? "Not tracked" : `${duration} sec`}${workout.timer_started_at ? " · Running (snapshot)" : ""}`,
  );
  if (includeNotes && workout.notes) lines.push(`Notes: ${workout.notes}`);
  if (!workout.exercises.length) lines.push("No exercises yet");
  workout.exercises.forEach((item, index) => {
    lines.push(
      "",
      `${index + 1}. ${item.exercise_name}${item.group_name ? ` · ${item.group_name}` : ""}`,
    );
    if (!item.sets.length) lines.push("No sets yet");
    item.sets.forEach((set, position) => {
      const values =
        item.tracking_type === "strength" || item.tracking_type === "bodyweight"
          ? `${set.weight == null ? "" : `${set.weight} ${item.weight_unit} · `}${set.reps ?? "—"} reps`
          : setLabel(item, set);
      lines.push(
        `  ${position + 1}. ${values} · ${set.is_completed ? "Completed" : "Planned"}`,
      );
      if (includeNotes && set.comment) lines.push(`  Comment: ${set.comment}`);
    });
  });
  return lines.join("\n");
}

export function downloadWorkoutCsv(
  workout: Workout,
  includeNotes: boolean,
): void {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", workoutCsv(workout, includeNotes)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `longevity-workout-${workout.performed_on}.csv`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
