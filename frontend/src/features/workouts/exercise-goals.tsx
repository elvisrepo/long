import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { NavigateWorkout } from "./workout-navigation";
import {
  goalChoices,
  goalTypesFor,
  goalTitle,
  goalValue,
} from "./goal-display";

export function ExerciseGoals({
  owner,
  date,
  exercise,
  canCreate,
  navigate,
}: {
  owner: string;
  date: string;
  exercise: api.Exercise;
  canCreate: boolean;
  navigate: NavigateWorkout;
}) {
  const query = useQuery({
    queryKey: ["workouts", owner, "goals", exercise.id, date],
    queryFn: () => api.getExerciseGoals(exercise.id, date),
  });
  const client = useQueryClient();
  const [editor, setEditor] = useState<{ goal?: api.ExerciseGoal } | null>(
    null,
  );
  const [removing, setRemoving] = useState<api.ExerciseGoal | null>(null);
  const [goalType, setGoalType] = useState<api.GoalType>(
    goalTypesFor(exercise.tracking_type)[0],
  );
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workouts", owner] }),
  });
  const busy = mutation.isPending;
  if (query.isPending) return <p role="status">Loading exercise goals…</p>;
  if (query.isError)
    return (
      <div>
        <p role="alert">Goals couldn't load.</p>
        <button onClick={() => void query.refetch()}>Retry goals</button>
      </div>
    );
  return (
    <div className="workout-stack">
      <p>
        Completed single sets through {date}, not estimated 1RM or workout
        totals. Goal type and units stay saved. Rate labels are rounded;
        achievement uses unrounded values. Duration means longer, not a faster
        race time. Bodyweight rep goals allow any optional recorded load,
        without estimating body mass.
      </p>
      {!canCreate && (
        <p>
          New goals require an active exercise and category. Existing targets
          remain available.
        </p>
      )}
      {!query.data.length && <p>No goals yet.</p>}
      <div className="workout-actions">
        <button
          disabled={busy || !canCreate || query.data.length >= 20}
          onClick={() => {
            mutation.reset();
            setGoalType(goalTypesFor(exercise.tracking_type)[0]);
            setEditor({});
          }}
        >
          New goal
        </button>
      </div>
      {query.data.map((goal) => (
        <section className="workout-card" key={goal.id}>
          <h3>{goalTitle(goal)}</h3>
          <p>{goal.achieved ? "Achieved" : "Not achieved"}</p>
          <progress
            className="workout-goal-progress"
            aria-label={`Progress toward ${goalTitle(goal)}`}
            max={100}
            value={Number(goal.progress_percent)}
          />
          <p>
            {goal.progress_percent}% of target{" "}
            {goal.goal_type === "best_pace"
              ? "(target pace / best pace)"
              : "(best value / target)"}
            .
          </p>
          {goal.source && goal.source_date ? (
            <>
              <p>
                {!goal.goal_type || goal.goal_type === "strength"
                  ? `${Number(goal.source.weight)} ${goal.weight_unit} × ${goal.source.reps} reps`
                  : goalValue(goal, goal.best_value!)}{" "}
                · {goal.source_date}
              </p>
              <button
                onClick={() =>
                  navigate({
                    view: "training",
                    date: goal.source_date!,
                    session: goal.source!.workout_id,
                    exercise: goal.source!.item_id,
                  })
                }
              >
                {!goal.goal_type || goal.goal_type === "strength"
                  ? "Open supporting lift"
                  : "Open supporting set"}
              </button>
            </>
          ) : (
            <p>
              No completed set meets this goal's saved type, units and required
              fields.
            </p>
          )}
          <div className="workout-actions">
            <button
              disabled={busy}
              aria-label={`Edit goal ${!goal.goal_type || goal.goal_type === "strength" ? `${Number(goal.target_weight)} ${goal.weight_unit} for ${goal.target_reps} reps` : goalTitle(goal)}`}
              onClick={() => {
                mutation.reset();
                setGoalType(goal.goal_type ?? "strength");
                setEditor({ goal });
              }}
            >
              Edit goal
            </button>
            <button
              disabled={busy}
              aria-label={`Remove goal ${!goal.goal_type || goal.goal_type === "strength" ? `${Number(goal.target_weight)} ${goal.weight_unit} for ${goal.target_reps} reps` : goalTitle(goal)}`}
              onClick={() => {
                mutation.reset();
                setRemoving(goal);
              }}
            >
              Remove goal
            </button>
          </div>
        </section>
      ))}
      {editor && (
        <Modal
          labelledBy="goal-editor-title"
          busy={busy}
          onClose={() => setEditor(null)}
        >
          <h2 id="goal-editor-title">
            {editor.goal ? "Edit goal" : "New goal"}
          </h2>
          <p>
            Type and units are saved with the goal. Speed/pace use distance and
            time from the same completed set. Pace minutes and seconds mean time
            per saved kilometre/mile, not decimal minutes.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              const paceSeconds =
                Number(fields.get("pace_minutes")) * 60 +
                Number(fields.get("pace_seconds"));
              const paceTarget =
                editor.goal?.target_value &&
                paceSeconds ===
                  Math.round(Number(editor.goal.target_value) * 60)
                  ? editor.goal.target_value
                  : (paceSeconds / 60).toFixed(3);
              const data: api.GoalInput =
                goalType === "strength"
                  ? {
                      target_weight: String(fields.get("weight")),
                      target_reps: Number(fields.get("reps")),
                      rep_rule: fields.get(
                        "rule",
                      ) as api.GoalDefinition["rep_rule"],
                    }
                  : {
                      ...(!editor.goal ? { goal_type: goalType } : {}),
                      target_value:
                        goalType === "best_pace"
                          ? paceTarget
                          : String(fields.get("value")),
                    };
              try {
                await mutation.mutateAsync(() =>
                  api.saveExerciseGoal(exercise.id, editor.goal?.id, data),
                );
                setEditor(null);
              } catch {
                /* Server error remains visible in the editor. */
              }
            }}
          >
            <div
              className="workout-fields"
              key={`${editor.goal?.id ?? "new"}:${goalType}`}
            >
              {!editor.goal && (
                <label style={{ gridColumn: "1 / -1" }}>
                  Goal type
                  <select
                    value={goalType}
                    disabled={busy}
                    onChange={(event) =>
                      setGoalType(event.target.value as api.GoalType)
                    }
                  >
                    {goalTypesFor(exercise.tracking_type).map((kind) => (
                      <option key={kind} value={kind}>
                        {goalChoices[kind]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {goalType === "strength" ? (
                <>
                  <label>
                    Target weight (
                    {editor.goal?.weight_unit ?? exercise.weight_unit})
                    <input
                      name="weight"
                      type="number"
                      min=".001"
                      max="10000"
                      step=".001"
                      required
                      disabled={busy}
                      defaultValue={editor.goal?.target_weight ?? ""}
                    />
                  </label>
                  <label>
                    Target reps
                    <input
                      name="reps"
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      required
                      disabled={busy}
                      defaultValue={editor.goal?.target_reps ?? 5}
                    />
                  </label>
                  <label>
                    Rep rule
                    <select
                      name="rule"
                      disabled={busy}
                      defaultValue={editor.goal?.rep_rule ?? "at_least"}
                    >
                      <option value="at_least">At least target reps</option>
                      <option value="exact">Exactly target reps</option>
                    </select>
                  </label>
                </>
              ) : goalType === "best_pace" ? (
                <>
                  <label>
                    Pace minutes
                    <input
                      name="pace_minutes"
                      type="number"
                      min="0"
                      max="100000"
                      step="1"
                      required
                      disabled={busy}
                      defaultValue={Math.floor(
                        Math.round(
                          Number(editor.goal?.target_value ?? 5) * 60,
                        ) / 60,
                      )}
                    />
                  </label>
                  <label>
                    Pace seconds
                    <input
                      name="pace_seconds"
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      required
                      disabled={busy}
                      defaultValue={
                        Math.round(
                          Number(editor.goal?.target_value ?? 5) * 60,
                        ) % 60
                      }
                    />
                  </label>
                  <p>
                    At most this pace per{" "}
                    {editor.goal?.distance_unit ?? exercise.distance_unit}{" "}
                    (lower is faster).
                  </p>
                </>
              ) : (
                <label>
                  Target{" "}
                  {goalType === "max_speed"
                    ? `speed (${editor.goal?.distance_unit ?? exercise.distance_unit}/h)`
                    : goalType === "distance"
                      ? `distance (${editor.goal?.distance_unit ?? exercise.distance_unit})`
                      : goalType === "duration"
                        ? "duration (seconds)"
                        : "reps"}
                  <input
                    key={goalType}
                    name="value"
                    type="number"
                    min={
                      goalType === "reps" || goalType === "duration"
                        ? "1"
                        : ".001"
                    }
                    max={goalType === "duration" ? "604800" : "100000"}
                    step={
                      goalType === "reps" || goalType === "duration"
                        ? "1"
                        : ".001"
                    }
                    required
                    disabled={busy}
                    defaultValue={editor.goal?.target_value ?? ""}
                  />
                </label>
              )}
            </div>
            {mutation.isError && (
              <p role="alert">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Goal couldn't save."}
              </p>
            )}
            <div className="workout-actions">
              <button disabled={busy}>Save goal</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal
          labelledBy="remove-goal-title"
          busy={busy}
          onClose={() => setRemoving(null)}
        >
          <h2 id="remove-goal-title">Remove goal?</h2>
          <p>
            Remove the {goalTitle(removing)} target? Logged sets and personal
            records will not be deleted.
          </p>
          {mutation.isError && (
            <p role="alert">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Goal couldn't be removed."}
            </p>
          )}
          <div className="workout-actions">
            <button
              disabled={busy}
              onClick={async () => {
                try {
                  await mutation.mutateAsync(() =>
                    api.deleteExerciseGoal(removing.id),
                  );
                  setRemoving(null);
                } catch {
                  /* Retain dialog and error for retry. */
                }
              }}
            >
              Confirm remove goal
            </button>
            <button disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
