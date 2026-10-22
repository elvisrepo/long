import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import {
  dayLabel,
  setLabel,
  type NavigateWorkout,
  type RunAction,
} from "./workout-navigation";

export function CopyWorkoutDialog({
  source,
  destination,
  busy,
  run,
  navigate,
  onClose,
  onBack,
}: {
  source: api.Workout;
  destination: string;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
  onClose: () => void;
  onBack?: () => void;
}) {
  const all = () =>
    Object.fromEntries(
      source.exercises.map((item) => [item.id, item.sets.map((s) => s.id)]),
    );
  const [selection, setSelection] = useState<Record<string, string[]>>(all);
  const [date, setDate] = useState(destination);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || pending;
  const selected = source.exercises.filter(
    (item) => selection[item.id] !== undefined,
  );
  const setCount = selected.reduce(
    (n, item) => n + selection[item.id].length,
    0,
  );
  const full =
    selected.length === source.exercises.length &&
    selected.every((item) => selection[item.id].length === item.sets.length);
  function submit() {
    if (locked || !selected.length) return;
    setPending(true);
    setError("");
    run(async () => {
      try {
        const saved = full
          ? await api.copyWorkout(source.id, date)
          : await api.copyWorkout(
              source.id,
              date,
              selected.map((item) => ({
                item_id: item.id,
                set_ids: selection[item.id],
              })),
            );
        onClose();
        navigate({ view: "home", date: saved.performed_on });
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Workout couldn't be copied. Please retry.",
        );
      } finally {
        setPending(false);
      }
    });
  }
  return (
    <Modal
      labelledBy="copy-selection-title"
      className="workout-share-modal workout-copy-modal"
      busy={locked}
      onClose={onClose}
    >
      <h2 id="copy-selection-title">Copy workout</h2>
      <p className="workout-copy-dates">
        {dayLabel(source.performed_on)} → {dayLabel(date)}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {editing && (
          <section className="workout-copy-edit" aria-label="Copy settings">
            <label>
              Copy to date
              <input
                type="date"
                required
                value={date}
                disabled={locked}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            {onBack && (
              <button type="button" disabled={locked} onClick={onBack}>
                Choose another workout
              </button>
            )}
            <p className="workout-note">
              Copies start as planned sets. Notes and comments stay with the
              original.
            </p>
          </section>
        )}
        <section
          className="workout-share-selection"
          aria-label="Copy selection"
        >
          <label className="workout-share-all">
            <span>Select all</span>
            <input
              type="checkbox"
              aria-label="Select all"
              checked={full && selected.length > 0}
              disabled={locked || !source.exercises.length}
              ref={(input) => {
                if (input) input.indeterminate = selected.length > 0 && !full;
              }}
              onChange={() => setSelection(full ? {} : all())}
            />
          </label>
          {!source.exercises.length && <p>No exercises to copy.</p>}
          {source.exercises.map((item, index) => {
            const included = selection[item.id] !== undefined;
            const complete =
              included && selection[item.id].length === item.sets.length;
            return (
              <section key={item.id}>
                <label className="workout-share-heading">
                  <strong>{item.exercise_name}</strong>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={complete}
                    aria-label={`Include exercise ${index + 1}: ${item.exercise_name}`}
                    ref={(input) => {
                      if (input) input.indeterminate = included && !complete;
                    }}
                    onChange={() =>
                      setSelection((old) => {
                        const next = { ...old };
                        if (complete) delete next[item.id];
                        else next[item.id] = item.sets.map((set) => set.id);
                        return next;
                      })
                    }
                  />
                </label>
                {item.sets.map((set, n) => (
                  <label className="workout-share-set" key={set.id}>
                    <span className="workout-share-number">{n + 1}</span>
                    <span className="workout-share-values">
                      {setLabel(item, set)}
                    </span>
                    <span />
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={selection[item.id]?.includes(set.id) ?? false}
                      aria-label={`Include exercise ${index + 1} set ${n + 1}: ${setLabel(item, set)}`}
                      onChange={(event) =>
                        setSelection((old) => ({
                          ...old,
                          [item.id]: event.target.checked
                            ? item.sets
                                .filter(
                                  (candidate) =>
                                    candidate.id === set.id ||
                                    old[item.id]?.includes(candidate.id),
                                )
                                .map((candidate) => candidate.id)
                            : (old[item.id] ?? []).filter(
                                (id) => id !== set.id,
                              ),
                        }))
                      }
                    />
                  </label>
                ))}
                {!item.sets.length && (
                  <p className="workout-note workout-share-empty">
                    No sets — exercise only
                  </p>
                )}
                {included &&
                  !selection[item.id].length &&
                  item.sets.length > 0 && (
                    <p className="workout-note workout-share-empty">
                      Exercise only selected
                    </p>
                  )}
              </section>
            );
          })}
        </section>
        <p className="workout-note" role="status">
          {selected.length} exercises · {setCount} sets selected · Copied sets
          start planned
        </p>
        {pending && <p role="status">Copying workout…</p>}
        {error && (
          <>
            <p role="alert" className="workout-error">
              {error}
            </p>
            <p className="workout-note">
              Check the destination date before retrying if the connection
              dropped.
            </p>
          </>
        )}
        <div className="workout-share-footer">
          <button type="button" disabled={locked} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={locked}
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            Edit
          </button>
          <button
            className="primary-button"
            disabled={locked || !selected.length}
          >
            Copy
          </button>
        </div>
      </form>
    </Modal>
  );
}
