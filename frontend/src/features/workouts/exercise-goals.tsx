import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { NavigateWorkout } from "./workout-navigation";

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
        Actual strength lifts through {date}, not estimated 1RM. Saved goal
        units and rep rules stay explicit.
      </p>
      {!canCreate && (
        <p>
          New goals currently require an active weight-and-reps exercise.
          Existing targets remain available.
        </p>
      )}
      {!query.data.length && <p>No goals yet.</p>}
      <div className="workout-actions">
        <button
          disabled={busy || !canCreate || query.data.length >= 20}
          onClick={() => {
            mutation.reset();
            setEditor({});
          }}
        >
          New goal
        </button>
      </div>
      {query.data.map((goal) => (
        <section className="workout-card" key={goal.id}>
          <h3>
            {Number(goal.target_weight)} {goal.weight_unit} ×{" "}
            {goal.rep_rule === "at_least" ? "at least" : "exactly"}{" "}
            {goal.target_reps} reps
          </h3>
          <p>{goal.achieved ? "Achieved" : "Not achieved"}</p>
          <progress
            className="workout-goal-progress"
            aria-label={`Load progress toward ${Number(goal.target_weight)} ${goal.weight_unit} for ${goal.target_reps} reps`}
            max={100}
            value={Number(goal.progress_percent)}
          />
          <p>
            {goal.progress_percent}% of target load among sets meeting the rep
            rule.
          </p>
          {goal.source && goal.source_date ? (
            <>
              <p>
                {Number(goal.source.weight)} {goal.weight_unit} ×{" "}
                {goal.source.reps} reps · {goal.source_date}
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
                Open supporting lift
              </button>
            </>
          ) : (
            <p>No completed lift meets this goal's saved units and rep rule.</p>
          )}
          <div className="workout-actions">
            <button
              disabled={busy}
              aria-label={`Edit goal ${Number(goal.target_weight)} ${goal.weight_unit} for ${goal.target_reps} reps`}
              onClick={() => {
                mutation.reset();
                setEditor({ goal });
              }}
            >
              Edit goal
            </button>
            <button
              disabled={busy}
              aria-label={`Remove goal ${Number(goal.target_weight)} ${goal.weight_unit} for ${goal.target_reps} reps`}
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
            Units are saved with the goal. At least means the target reps or
            more; exactly means the stated rep count.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              const data: api.GoalInput = {
                target_weight: String(fields.get("weight")),
                target_reps: Number(fields.get("reps")),
                rep_rule: fields.get("rule") as api.GoalInput["rep_rule"],
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
            <div className="workout-fields">
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
            Remove the {Number(removing.target_weight)} {removing.weight_unit} ×{" "}
            {removing.target_reps} reps target? Logged sets and personal records
            will not be deleted.
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
