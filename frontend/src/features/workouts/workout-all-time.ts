import * as api from "./workout-api";
import {
  progressMetrics,
  type ProgressMetric,
  type ProgressSeries,
} from "./workout-analysis";

async function pages<T>(load: (offset: number) => Promise<api.SummaryPage<T>>) {
  const results: T[] = [];
  const types = new Set<api.TrackingType>();
  let offset = 0;
  while (true) {
    const page = await load(offset);
    results.push(...page.results);
    page.types?.forEach((type) => types.add(type));
    if (!page.next) return { results, types: [...types] };
    if (!page.results.length)
      throw new Error("All-time progress could not be fully loaded.");
    offset += page.results.length;
  }
}

function title(
  metric: ProgressMetric,
  type: api.TrackingType,
  unit: string,
  reps: number,
) {
  if (metric === "personal_records") return "All-time personal records";
  if (metric === "max_weight")
    return type === "bodyweight"
      ? "Highest external load (body weight not included)"
      : "Highest logged load";
  if (metric === "max_reps" && type === "bodyweight")
    return `Highest logged reps (external load ${unit} may vary)`;
  if (metric === "max_distance") return "Longest logged distance";
  if (metric === "max_duration") return "Longest logged duration";
  if (metric === "max_weight_reps") return `Max weight for ${reps} reps`;
  return progressMetrics([type]).find((option) => option.value === metric)!
    .label;
}

export async function getAllTimeProgress(
  exercise: string,
  date: string,
  metric: ProgressMetric,
  reps = 5,
): Promise<{ series: ProgressSeries[]; types: api.TrackingType[] }> {
  const needsRecords = [
    "personal_records",
    "max_weight",
    "max_weight_reps",
  ].includes(metric);
  const [points, records] = await Promise.all([
    metric === "personal_records"
      ? Promise.resolve({
          results: [] as api.ProgressPointRow[],
          types: [] as api.TrackingType[],
        })
      : pages((offset) =>
          api.getProgressPage(
            exercise,
            date,
            metric,
            metric === "max_weight_reps" ? reps : 5,
            offset,
          ),
        ),
    needsRecords
      ? pages((offset) => api.getRecordPage(exercise, date, offset))
      : Promise.resolve({
          results: [] as api.PersonalRecordRow[],
          types: [] as api.TrackingType[],
        }),
  ]);
  const groups = new Map<string, ProgressSeries>();
  const group = (row: api.ProgressPointRow) => {
    const key = `${row.tracking_type}:${row.weight_unit}:${row.distance_unit}`;
    if (!groups.has(key)) {
      const unit =
        metric === "max_reps" || metric === "workout_reps"
          ? "reps"
          : metric === "max_distance"
            ? row.distance_unit
            : metric === "max_duration"
              ? "sec"
              : metric === "max_volume" || metric === "workout_volume"
                ? `${row.weight_unit}·reps`
                : row.weight_unit;
      groups.set(key, {
        key,
        title: title(metric, row.tracking_type, row.weight_unit, reps),
        unit,
        points: [],
        records: [],
      });
    }
    return groups.get(key)!;
  };
  for (const row of points.results) {
    const series = group(row);
    const value = Number(row.value);
    if (!Number.isFinite(value))
      throw new Error("Invalid progress value received.");
    series.points.push({
      date: row.date,
      value,
      ...(row.session !== undefined ? { session: row.session } : {}),
      ...(metric === "estimated_1rm" &&
      row.source?.weight != null &&
      row.source.reps != null
        ? { source: { weight: row.source.weight, reps: row.source.reps } }
        : {}),
    });
  }
  for (const row of records.results) {
    if (metric === "max_weight_reps" && row.reps !== reps) continue;
    const series = group(row);
    series.records.push({
      label: `${row.reps} reps`,
      value: Number(row.value),
      unit: series.unit,
      date: row.date,
      source: row.source,
    });
  }
  for (const series of groups.values()) {
    if (!series.records.length && series.points.length) {
      const best = series.points.reduce((best, point) =>
        point.value > best.value ? point : best,
      );
      series.records.push({
        label: series.title,
        value: best.value,
        unit: series.unit,
        date: best.date,
      });
    }
  }
  return {
    series: [...groups.values()],
    types: [
      ...new Set([
        ...points.types,
        ...records.results.map((row) => row.tracking_type),
      ]),
    ],
  };
}
