import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import * as api from "./workout-api";
import { shiftDay, type NavigateWorkout } from "./workout-navigation";
import { formatProgressValue } from "./workout-analysis";
import { WorkoutPreview } from "./workout-preview";
import { useEstimateLimit } from "./use-estimate-limit";
const labels: Record<string, string> = {
  max_weight: "Max weight",
  max_reps: "Max reps",
  max_volume: "Max set volume",
  workout_volume: "Max workout volume",
  estimated_1rm: "Estimated 1RM",
  max_distance: "Max distance",
  max_duration: "Max time",
  max_speed: "Max speed",
  best_pace: "Best pace",
};
export function ExerciseStatistics({
  owner,
  date,
  exerciseId,
  navigate,
}: {
  owner: string;
  date: string;
  exerciseId: string;
  navigate: NavigateWorkout;
}) {
  const [period, setPeriod] = useState("all"),
    [ending, setEnding] = useState(date),
    [customFrom, setCustomFrom] = useState(shiftDay(date, -29)),
    [workoutId, setWorkoutId] = useState("");
  const [repLimit] = useEstimateLimit(exerciseId);
  const [preview, setPreview] = useState<{ date: string; id?: string } | null>(
    null,
  );
  const from =
    period === "week"
      ? shiftDay(ending, -((new Date(ending + "T12:00:00").getDay() + 6) % 7))
      : period === "month"
        ? ending.slice(0, 7) + "-01"
        : period === "year"
          ? ending.slice(0, 4) + "-01-01"
          : period === "custom"
            ? customFrom
            : undefined;
  const ordered = !from || from <= ending;
  const options = {
    ...(from ? { date_from: from } : {}),
    ...(period === "workout" && workoutId ? { workout_id: workoutId } : {}),
    ...(repLimit !== 10 ? { rep_limit: repLimit } : {}),
  };
  const query = useQuery({
    queryKey: ["workouts", owner, "statistics", exerciseId, ending, options],
    queryFn: () =>
      Object.keys(options).length
        ? api.getExerciseStats(exerciseId, ending, options)
        : api.getExerciseStats(exerciseId, ending),
    enabled: ordered && (period !== "workout" || !!workoutId),
  });
  const workouts = useInfiniteQuery({
    queryKey: ["workouts", owner, "statistics-workouts", exerciseId, date],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.getExerciseHistoryPage(exerciseId, date, pageParam),
    getNextPageParam: (page, pages) =>
      page.next && page.results.length
        ? pages.reduce((sum, value) => sum + value.results.length, 0)
        : undefined,
    enabled: period === "workout",
  });
  return (
    <div className="workout-statistics-screen">
      <div className="workout-statistic-filters">
        <label>
          Period
          <select
            aria-label="Period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            {["workout", "week", "month", "year", "all", "custom"].map(
              (value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ),
            )}
          </select>
        </label>
        {period === "workout" ? (
          <label>
            Workout date
            <select
              aria-label="Workout date"
              value={workoutId}
              onChange={(event) => setWorkoutId(event.target.value)}
            >
              <option value="">Choose workout</option>
              {workouts.data?.pages
                .flatMap((page) => page.results)
                .map((workout) => (
                  <option key={workout.id} value={workout.id}>
                    {workout.performed_on} · {workout.name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <>
            {period === "custom" && (
              <label>
                From date
                <input
                  type="date"
                  value={customFrom}
                  max={ending}
                  onChange={(event) => {
                    if (event.target.value) setCustomFrom(event.target.value);
                  }}
                />
              </label>
            )}
            <label>
              Through date
              <input
                type="date"
                value={ending}
                max={date}
                onChange={(event) => {
                  if (event.target.value) setEnding(event.target.value);
                }}
              />
            </label>
          </>
        )}
      </div>
      {period === "workout" && workouts.hasNextPage && (
        <button
          disabled={workouts.isFetchingNextPage}
          onClick={() => void workouts.fetchNextPage()}
        >
          Load more workout dates
        </button>
      )}
      {period === "workout" && workouts.isError && (
        <button onClick={() => void workouts.refetch()}>
          Retry workout dates
        </button>
      )}
      {!ordered ? (
        <p role="alert">Choose an ordered date range.</p>
      ) : period === "workout" && !workoutId ? (
        <p>Choose a workout to view its statistics.</p>
      ) : query.isPending ? (
        <p role="status">Loading exercise statistics…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Exercise statistics couldn't load.</p>
          <button onClick={() => void query.refetch()}>Retry statistics</button>
        </>
      ) : query.data.groups.length ? (
        query.data.groups.map((group) => {
          const totals = [
            { label: "Completed sessions", value: String(group.session_count) },
            { label: "Completed sets", value: String(group.set_count) },
            ...(group.reps_total !== null
              ? [{ label: "Total reps", value: String(group.reps_total) }]
              : []),
            ...(group.volume_total !== null
              ? [
                  {
                    label: "Total recorded volume",
                    value: `${Number(group.volume_total)} ${group.weight_unit}·reps`,
                  },
                ]
              : []),
            ...(group.distance_total !== null
              ? [
                  {
                    label: "Total distance",
                    value: `${Number(group.distance_total)} ${group.distance_unit}`,
                  },
                ]
              : []),
            ...(group.duration_seconds_total !== null
              ? [
                  {
                    label: "Total duration",
                    value: `${group.duration_seconds_total} sec`,
                  },
                ]
              : []),
          ];
          return (
            <section
              key={`${group.tracking_type}:${group.weight_unit}:${group.distance_unit}`}
            >
              {query.data.groups.length > 1 && (
                <h3>
                  {group.tracking_type === "strength"
                    ? `Weights · ${group.weight_unit}`
                    : group.tracking_type === "bodyweight"
                      ? `Reps · external ${group.weight_unit}`
                      : group.tracking_type === "cardio"
                        ? `Distance & time · ${group.distance_unit}`
                        : "Time"}
                </h3>
              )}
              <div className="workout-statistic-tiles">
                {totals.map((stat) => (
                  <div key={stat.label}>
                    <small>{stat.label}</small>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
                {Object.entries(group.bests ?? {}).map(([metric, point]) => {
                  const unit =
                    metric === "max_reps"
                      ? "reps"
                      : metric.includes("volume")
                        ? `${group.weight_unit}·reps`
                        : metric === "max_distance"
                          ? group.distance_unit
                          : metric === "max_duration"
                            ? "sec"
                            : metric === "max_speed"
                              ? `${group.distance_unit}/h`
                              : metric === "best_pace"
                                ? `min/${group.distance_unit}`
                                : group.weight_unit;
                  return (
                    <button
                      key={metric}
                      aria-label={`${labels[metric] ?? metric}: ${formatProgressValue(Number(Number(point.value).toFixed(3)), unit)} · ${point.date}`}
                      onClick={() =>
                        setPreview({
                          date: point.date,
                          id: point.source?.workout_id ?? point.workout_id,
                        })
                      }
                    >
                      <small>{labels[metric] ?? metric}</small>
                      <strong>
                        {formatProgressValue(
                          Number(Number(point.value).toFixed(3)),
                          unit,
                        )}
                      </strong>
                      <small>{point.date}</small>
                    </button>
                  );
                })}
              </div>
              <div className="workout-actions">
                <button onClick={() => setPreview({ date: group.first_date })}>
                  First training: {group.first_date}
                </button>
                <button onClick={() => setPreview({ date: group.last_date })}>
                  Last training: {group.last_date}
                </button>
              </div>
            </section>
          );
        })
      ) : (
        <p>No completed sets in this period.</p>
      )}
      {preview && (
        <WorkoutPreview
          owner={owner}
          date={preview.date}
          workoutId={preview.id}
          navigate={navigate}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
