import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as api from "./workout-api";
import { WorkoutProgress } from "./workout-progress";
import { ExerciseGoals } from "./exercise-goals";
import { ExerciseRecords } from "./exercise-records";
import { ExerciseStatistics } from "./exercise-statistics";
import { ExerciseTrainingHistory } from "./exercise-training-history";
import type { ProgressMetric } from "./workout-analysis";
import type { NavigateWorkout, WorkoutSearch } from "./workout-navigation";
const sections = [
  { id: "history", label: "History", accessible: "Exercise history" },
  { id: "graph", label: "Graph", accessible: "Exercise progress" },
  { id: "records", label: "Records", accessible: "Records" },
  { id: "stats", label: "Stats", accessible: "Statistics" },
  { id: "goals", label: "Goals", accessible: "Goals" },
] as const;
export function WorkoutOverview({
  owner,
  date,
  exerciseId,
  catalog,
  navigate,
  initialSection = "stats",
}: {
  owner: string;
  date: string;
  exerciseId?: string;
  catalog: api.WorkoutCatalog;
  navigate: NavigateWorkout;
  initialSection?: WorkoutSearch["section"];
}) {
  const [tab, setTab] = useState(initialSection);
  const [graph, setGraph] = useState<{
    metric: ProgressMetric;
    reps: number;
    days: number;
  } | null>(null);
  const exercise = catalog.exercises.find((row) => row.id === exerciseId);
  return (
    <section className="workout-stack workout-exercise-overview">
      {exercise && <h2>{exercise.name}</h2>}
      <details open={!exercise ? true : undefined}>
        <summary>Change exercise</summary>
        <label>
          Overview exercise
          <select
            value={exerciseId ?? ""}
            onChange={(event) =>
              navigate({
                view: "overview",
                date,
                exercise: event.target.value || undefined,
                section: tab,
              })
            }
          >
            <option value="">Choose exercise…</option>
            {catalog.exercises.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.is_active ? "" : " (archived)"}
              </option>
            ))}
          </select>
        </label>
      </details>
      <nav
        className="workout-tabs workout-overview-tabs"
        aria-label="Exercise overview sections"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            aria-label={section.accessible}
            aria-pressed={tab === section.id}
            onClick={() => setTab(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>
      {!exerciseId ? (
        <p>Choose an exercise to review.</p>
      ) : tab === "stats" ? (
        <ExerciseStatistics
          key={`${exerciseId}:${date}`}
          owner={owner}
          date={date}
          exerciseId={exerciseId}
          navigate={navigate}
        />
      ) : tab === "records" ? (
        <ExerciseRecords
          key={exerciseId}
          owner={owner}
          date={date}
          exerciseId={exerciseId}
          navigate={navigate}
          onGraph={(reps) => {
            setGraph({ metric: "rep_maxes", reps, days: 0 });
            setTab("graph");
          }}
        />
      ) : tab === "graph" ? (
        <WorkoutProgress
          key={`${exerciseId}:${graph?.reps ?? "default"}`}
          owner={owner}
          date={date}
          exerciseId={exerciseId}
          catalog={catalog}
          navigate={navigate}
          showExerciseSelector={false}
          compact
          initialMetric={graph?.metric}
          initialReps={graph?.reps}
          initialDays={graph?.days}
        />
      ) : tab === "goals" ? (
        exercise ? (
          <ExerciseGoals
            key={exerciseId}
            owner={owner}
            date={date}
            exercise={exercise}
            canCreate={
              exercise.is_active &&
              catalog.categories.some(
                (category) =>
                  category.id === exercise.category_id && category.is_active,
              )
            }
            navigate={navigate}
          />
        ) : (
          <p role="alert">Exercise is unavailable.</p>
        )
      ) : exercise ? (
        <OverviewHistory
          owner={owner}
          exercise={exercise}
          date={date}
          navigate={navigate}
        />
      ) : (
        <p role="alert">Exercise is unavailable.</p>
      )}
    </section>
  );
}
function OverviewHistory({
  owner,
  exercise,
  date,
  navigate,
}: {
  owner: string;
  exercise: api.Exercise;
  date: string;
  navigate: NavigateWorkout;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workouts", owner] }),
  });
  const item: api.WorkoutExercise = {
    id: "overview",
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    category_name: "",
    tracking_type: exercise.tracking_type,
    weight_unit: exercise.weight_unit,
    distance_unit: exercise.distance_unit,
    display_order: 0,
    sets: [],
  };
  const workout: api.Workout = {
    id: "overview",
    name: "Overview",
    performed_on: date,
    notes: "",
    is_finished: true,
    created_at: "",
    completed_set_count: 0,
    exercises: [],
  };
  return (
    <ExerciseTrainingHistory
      overview
      workout={workout}
      item={item}
      owner={owner}
      busy={mutation.isPending}
      run={(action) => mutation.mutate(action)}
      navigate={navigate}
      onTrack={() => {}}
    />
  );
}
