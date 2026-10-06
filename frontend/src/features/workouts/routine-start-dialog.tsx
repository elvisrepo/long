import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import {
  dayLabel,
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
  const [carry, setCarry] = useState(false);
  const [selection, setSelection] = useState<Record<string, string[]> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const query = useQuery({
    queryKey: ["workouts", owner, "routine-preview", dayId, destination, carry],
    queryFn: () => api.getRoutineStartPreview(dayId, destination, carry),
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
    <Modal labelledBy="routine-start-title" busy={locked} onClose={onClose}>
      <h2 id="routine-start-title">Preview routine start</h2>
      <p>
        Start on {dayLabel(destination)}. Your saved routine stays unchanged.
        All new sets start planned.
      </p>
      <label className="workout-copy-choice">
        <input
          type="checkbox"
          checked={carry}
          disabled={locked}
          onChange={(event) => {
            setCarry(event.target.checked);
            setError("");
            setRequiresRefresh(false);
          }}
        />
        Fill blank fields from earlier completed sets
      </label>
      <p className="workout-note">
        Fixed values stay fixed, including zero load. Matches use the same type
        and units before this date, by set position. Missing or ambiguous
        history leaves blanks unchanged. Edit quantities after starting if
        needed.
      </p>
      {query.isPending ? (
        <p role="status">Loading routine preview…</p>
      ) : query.isError ? (
        <p role="alert">Routine preview couldn't load. Refresh to retry.</p>
      ) : (
        plan && (
          <section aria-label="Routine start preview" className="workout-stack">
            <h3>{plan.name}</h3>
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
                className="workout-copy-item"
                disabled={locked}
              >
                <legend>
                  Exercise {index + 1}: {item.exercise_name}
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
                  Include exercise (selects all its sets)
                </label>
                <p className="workout-note">
                  {item.tracking_type} · {item.weight_unit} /{" "}
                  {item.distance_unit}
                  {item.group_name ? ` · ${item.group_name}` : ""}
                </p>
                <p className="workout-note">{item.carry_reason}</p>
                {!item.sets.length && (
                  <p>No predefined sets — exercise only.</p>
                )}
                {item.sets.map((row, n) => (
                  <div key={row.id}>
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
                        From {row.source.date}: {row.source.fields.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
                {chosen[item.id]?.length === 0 && (
                  <p>
                    Exercise only selected. Uncheck Include exercise to omit it
                    entirely.
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
            If the connection dropped, check the destination before retrying: a
            workout might already exist.
          </p>
        </>
      )}
      <div className="workout-actions">
        <button
          className="primary-button"
          disabled={
            locked ||
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
                const workout = await api.startRoutineDay(dayId, destination, {
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
          Start planned workout
        </button>
        <button disabled={locked} onClick={() => void refresh()}>
          Refresh preview
        </button>
        <button disabled={locked} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
