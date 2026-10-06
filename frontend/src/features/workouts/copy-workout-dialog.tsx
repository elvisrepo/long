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
  const [preview, setPreview] = useState(false);
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
    <Modal labelledBy="copy-selection-title" busy={locked} onClose={onClose}>
      <h2 id="copy-selection-title">Copy {source.name || "Workout"}</h2>
      <p>
        Source: {dayLabel(source.performed_on)}. Choose what to copy into a
        separate workout. The original stays unchanged.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (preview) submit();
          else if (selected.length) {
            setPreview(true);
            setError("");
          }
        }}
      >
        <label>
          Copy to date
          <input
            type="date"
            required
            value={date}
            disabled={locked || preview}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <p>
          Completion, workout notes and set comments are not copied. All copied
          sets start planned.
        </p>
        {preview ? (
          <section
            role="region"
            aria-label="Copy preview"
            className="workout-stack"
          >
            <h3>Copy preview</h3>
            <p>
              {selected.length} exercises · {setCount} planned sets ·{" "}
              {dayLabel(date)}
            </p>
            {selected.map((item) => (
              <div
                key={item.id}
                className={`workout-inset${item.group_name ? " workout-group-mark" : ""}`}
                style={
                  item.group_name
                    ? { borderInlineStartColor: item.group_colour ?? "#007f68" }
                    : undefined
                }
              >
                <h4>{item.exercise_name}</h4>
                {item.group_name && (
                  <p className="workout-note">{item.group_name}</p>
                )}
                {item.sets
                  .filter((s) => selection[item.id].includes(s.id))
                  .map((s) => (
                    <p key={s.id}>{setLabel(item, s)}</p>
                  ))}
                {!selection[item.id].length && <p>No sets — exercise only</p>}
              </div>
            ))}
          </section>
        ) : (
          <div className="workout-stack">
            <div className="workout-actions">
              <button
                type="button"
                disabled={locked}
                onClick={() => setSelection(all())}
              >
                Select all
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => setSelection({})}
              >
                Clear selection
              </button>
            </div>
            {!source.exercises.length && <p>No exercises to copy.</p>}
            {source.exercises.map((item, index) => (
              <fieldset
                className="workout-copy-item"
                key={item.id}
                disabled={locked}
              >
                <legend>
                  Exercise {index + 1}: {item.exercise_name}
                </legend>
                <label className="workout-copy-choice">
                  <input
                    type="checkbox"
                    checked={selection[item.id] !== undefined}
                    aria-label={`Include exercise ${index + 1}: ${item.exercise_name}`}
                    onChange={(event) =>
                      setSelection((old) => {
                        const next = { ...old };
                        if (event.target.checked)
                          next[item.id] = item.sets.map((s) => s.id);
                        else delete next[item.id];
                        return next;
                      })
                    }
                  />
                  Include exercise (selects all its sets)
                </label>
                {item.group_name && (
                  <p className="workout-note">{item.group_name}</p>
                )}
                {!item.sets.length && <p>No sets — exercise only</p>}
                {item.sets.map((s, n) => (
                  <label key={s.id} className="workout-copy-choice">
                    <input
                      type="checkbox"
                      checked={selection[item.id]?.includes(s.id) ?? false}
                      aria-label={`Include exercise ${index + 1} set ${n + 1}: ${setLabel(item, s)}`}
                      onChange={(event) =>
                        setSelection((old) => ({
                          ...old,
                          [item.id]: event.target.checked
                            ? item.sets
                                .filter(
                                  (set) =>
                                    set.id === s.id ||
                                    old[item.id]?.includes(set.id),
                                )
                                .map((set) => set.id)
                            : (old[item.id] ?? []).filter((id) => id !== s.id),
                        }))
                      }
                    />
                    <span>
                      Set {n + 1}: {setLabel(item, s)}
                    </span>
                  </label>
                ))}
                {selection[item.id]?.length === 0 && item.sets.length > 0 && (
                  <p>
                    Exercise only selected. Uncheck Include exercise to omit it
                    entirely.
                  </p>
                )}
              </fieldset>
            ))}
            <p role="status">
              {selected.length} exercises · {setCount} sets selected
            </p>
          </div>
        )}
        {pending && <p role="status">Copying workout…</p>}
        {error && (
          <>
            <p role="alert" className="workout-error">
              {error}
            </p>
            <p className="workout-note">
              If the connection dropped, check the destination date before
              retrying: the copy might already have been saved.
            </p>
          </>
        )}
        <div className="workout-actions">
          <button
            className="primary-button"
            disabled={locked || !selected.length}
          >
            {preview ? "Create planned workout" : "Preview copy"}
          </button>
          {preview && (
            <button
              type="button"
              disabled={locked}
              onClick={() => setPreview(false)}
            >
              Edit selection
            </button>
          )}
          {onBack && (
            <button type="button" disabled={locked} onClick={onBack}>
              Choose another workout
            </button>
          )}
          <button type="button" disabled={locked} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
