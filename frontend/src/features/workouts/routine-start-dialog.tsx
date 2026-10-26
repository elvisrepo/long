import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import {
  setLabel,
  type NavigateWorkout,
  type RunAction,
} from "./workout-navigation";

export function RoutineStartDialog({
  owner,
  dayId,
  destination,
  busy,
  run,
  navigate,
  onClose,
}: {
  owner: string;
  dayId: string;
  destination: string;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
  onClose: () => void;
}) {
  const [performedOn, setPerformedOn] = useState(destination);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(performedOn);
  const [carry, setCarry] = useState(false);
  const [selection, setSelection] = useState<Record<string, string[]> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const query = useQuery({
    queryKey: ["workouts", owner, "routine-preview", dayId, performedOn, carry],
    queryFn: () => api.getRoutineStartPreview(dayId, performedOn, carry),
    enabled: validDate,
  });
  const plan = query.data;
  const all = () =>
    Object.fromEntries(
      (plan?.exercises ?? []).map((i) => [i.id, i.sets.map((s) => s.id)]),
    );
  const chosen = selection ?? all();
  const selected =
    plan?.exercises.filter((i) => chosen[i.id] !== undefined) ?? [];
  const locked = busy || pending || query.isFetching;
  async function refresh() {
    const result = await query.refetch();
    if (!result.isError) {
      setRequiresRefresh(false);
      setError("");
    }
  }
  return (
    <Modal
      labelledBy="routine-start-title"
      className="routine-dialog"
      busy={locked}
      onClose={onClose}
    >
      <header className="routine-dialog-header">
        <h2 id="routine-start-title">Start workout</h2>
        {plan && <p>{plan.name}</p>}
      </header>
      <div className="routine-dialog-body">
        <label className="routine-start-date">
          Workout date
          <input
            type="date"
            value={performedOn}
            disabled={locked}
            onChange={(event) => {
              setPerformedOn(event.target.value);
              setSelection(null);
              setRequiresRefresh(false);
              setError("");
            }}
            required
          />
        </label>
        <label className="workout-copy-choice routine-carry-choice">
          <input
            type="checkbox"
            aria-label="Fill blank fields from earlier completed sets"
            checked={carry}
            disabled={locked}
            onChange={(event) => {
              setCarry(event.target.checked);
              setError("");
              setRequiresRefresh(false);
            }}
          />
          Use previous values for blanks
        </label>
        <details className="routine-help">
          <summary>Previous values & planned sets</summary>
          <p>
            All new sets start planned. Fixed values stay fixed, including zero
            load. Earlier completed sets must match the exercise type and units
            before this date. Missing or ambiguous history leaves blanks
            unchanged. Edit quantities after starting.
          </p>
        </details>
        {!validDate ? (
          <p role="alert">Choose a workout date.</p>
        ) : query.isPending ? (
          <p role="status">Loading routine preview…</p>
        ) : query.isError ? (
          <p role="alert">Routine preview couldn't load. Refresh to retry.</p>
        ) : (
          plan && (
            <section
              aria-label="Routine start preview"
              className="workout-stack"
            >
              {plan.notes && <p>{plan.notes}</p>}
              <div className="workout-actions">
                <button disabled={locked} onClick={() => setSelection(all())}>
                  Select all
                </button>
                <button disabled={locked} onClick={() => setSelection({})}>
                  Clear selection
                </button>
              </div>
              {plan.exercises.map((item, index) => (
                <fieldset
                  key={item.id}
                  className="routine-preview-item"
                  disabled={locked}
                >
                  <legend className="visually-hidden">
                    {item.exercise_name}
                  </legend>
                  <label className="workout-copy-choice">
                    <input
                      type="checkbox"
                      checked={chosen[item.id] !== undefined}
                      aria-label={`Include routine exercise ${index + 1}: ${item.exercise_name}`}
                      onChange={(event) => {
                        const next = { ...chosen };
                        if (event.target.checked)
                          next[item.id] = item.sets.map((s) => s.id);
                        else delete next[item.id];
                        setSelection(next);
                      }}
                    />
                    <span>{item.exercise_name}</span>
                  </label>
                  {!item.sets.length && (
                    <p>No predefined sets — exercise only.</p>
                  )}
                  {item.sets.map((row, n) => (
                    <div className="routine-preview-set" key={row.id}>
                      <label className="workout-copy-choice">
                        <input
                          type="checkbox"
                          checked={chosen[item.id]?.includes(row.id) ?? false}
                          aria-label={`Include routine exercise ${index + 1} set ${n + 1}`}
                          onChange={(event) =>
                            setSelection({
                              ...chosen,
                              [item.id]: event.target.checked
                                ? item.sets
                                    .filter(
                                      (s) =>
                                        s.id === row.id ||
                                        chosen[item.id]?.includes(s.id),
                                    )
                                    .map((s) => s.id)
                                : (chosen[item.id] ?? []).filter(
                                    (id) => id !== row.id,
                                  ),
                            })
                          }
                        />
                        <span>{setLabel(item, row)}</span>
                      </label>
                      {row.source && (
                        <p className="workout-note">
                          Previous: {row.source.date} ·{" "}
                          {row.source.fields
                            .map((field) =>
                              field === "duration_seconds" ? "time" : field,
                            )
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                  {chosen[item.id]?.length === 0 && (
                    <p>
                      Exercise only selected. Uncheck Include exercise to omit
                      it entirely.
                    </p>
                  )}
                </fieldset>
              ))}
            </section>
          )
        )}
        {error && (
          <>
            <p role="alert" className="workout-error">
              {error}
            </p>
            <p>
              If the connection dropped, check the destination before retrying:
              a workout might already exist.
            </p>
          </>
        )}
        {(requiresRefresh || query.isError) && (
          <button disabled={locked} onClick={() => void refresh()}>
            Refresh preview
          </button>
        )}
      </div>
      <footer className="routine-dialog-footer routine-start-footer">
        <button disabled={locked} onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          aria-label="Start planned workout"
          disabled={
            locked ||
            !validDate ||
            query.isError ||
            !plan ||
            !selected.length ||
            requiresRefresh
          }
          onClick={() => {
            if (!plan) return;
            setPending(true);
            setError("");
            run(async () => {
              try {
                const workout = await api.startRoutineDay(dayId, performedOn, {
                  carry_forward: carry,
                  preview_token: plan.preview_token,
                  selection: selected.map((i) => ({
                    item_id: i.id,
                    set_ids: i.sets
                      .filter((s) => chosen[i.id].includes(s.id))
                      .map((s) => s.id),
                  })),
                });
                onClose();
                navigate({ view: "home", date: workout.performed_on });
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Routine couldn't start. Refresh and retry.",
                );
                setRequiresRefresh(true);
              } finally {
                setPending(false);
              }
            });
          }}
        >
          Start workout
        </button>
      </footer>
    </Modal>
  );
}
