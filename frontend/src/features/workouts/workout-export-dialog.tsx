import { useState } from "react";
import { Modal } from "../../components/modal";
import type { Workout } from "./workout-api";
import { setLabel } from "./workout-navigation";
import { downloadWorkoutCsv, workoutSummary } from "./workout-export";

function SelectionBox({
  label,
  checked,
  partial,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  partial?: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(input) => {
        if (input) input.indeterminate = !!partial;
      }}
      onChange={onChange}
    />
  );
}

export function WorkoutExportDialog({
  workout,
  onClose,
}: {
  workout: Workout;
  onClose: () => void;
}) {
  const [exercises, setExercises] = useState(
    () => new Set(workout.exercises.map((item) => item.id)),
  );
  const [sets, setSets] = useState(
    () =>
      new Set(
        workout.exercises.flatMap((item) => item.sets.map((set) => set.id)),
      ),
  );
  const [targets, setTargets] = useState(false);
  const [options, setOptions] = useState(false);
  const [format, setFormat] = useState("text");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = {
    ...workout,
    exercises: workout.exercises
      .filter((item) => exercises.has(item.id))
      .map((item) => ({
        ...item,
        sets: item.sets.filter((set) => sets.has(set.id)),
      })),
  };
  const summary = workoutSummary(selected, includeNotes);
  const all = workout.exercises.every(
    (item) =>
      exercises.has(item.id) && item.sets.every((set) => sets.has(set.id)),
  );
  const any = exercises.size > 0;
  const empty = workout.exercises.length > 0 && !any;
  function clearFeedback() {
    setMessage("");
    setError("");
  }
  function toggleExercise(id: string, checked: boolean) {
    const item = workout.exercises.find((item) => item.id === id)!;
    setExercises((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setSets((current) => {
      const next = new Set(current);
      item.sets.forEach((set) => {
        if (checked) next.add(set.id);
        else next.delete(set.id);
      });
      return next;
    });
    clearFeedback();
  }
  async function copy() {
    setPending(true);
    clearFeedback();
    try {
      await navigator.clipboard.writeText(summary);
      setMessage("Summary copied to clipboard.");
    } catch {
      setOptions(true);
      setError("Clipboard unavailable. Select and copy the preview manually.");
    } finally {
      setPending(false);
    }
  }
  async function share() {
    if (format === "csv") {
      clearFeedback();
      try {
        downloadWorkoutCsv(selected, includeNotes);
        setMessage("CSV download requested. Check your downloads folder.");
      } catch {
        setError("CSV download failed. Please try again.");
      }
      return;
    }
    if (!navigator.share) {
      clearFeedback();
      setTargets(true);
      return;
    }
    setPending(true);
    clearFeedback();
    try {
      await navigator.share({ title: workout.name, text: summary });
      setMessage("Workout shared.");
    } catch (reason) {
      if (
        !(
          typeof reason === "object" &&
          reason !== null &&
          "name" in reason &&
          reason.name === "AbortError"
        )
      ) {
        setTargets(true);
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      labelledBy="workout-export-title"
      className="workout-share-modal"
      busy={pending}
      onClose={onClose}
    >
      <h2 id="workout-export-title">Share workout</h2>
      <div className="workout-share-selection">
        <label className="workout-share-all">
          <span>Select all</span>
          <SelectionBox
            label="Select all"
            checked={all}
            partial={any && !all}
            disabled={pending || !workout.exercises.length}
            onChange={() => {
              setExercises(
                new Set(all ? [] : workout.exercises.map((item) => item.id)),
              );
              setSets(
                new Set(
                  all
                    ? []
                    : workout.exercises.flatMap((item) =>
                        item.sets.map((set) => set.id),
                      ),
                ),
              );
              clearFeedback();
            }}
          />
        </label>
        {workout.exercises.map((item) => {
          const checked = exercises.has(item.id);
          const complete =
            checked && item.sets.every((set) => sets.has(set.id));
          return (
            <section key={item.id} className="workout-share-exercise">
              <label className="workout-share-heading">
                <strong>{item.exercise_name}</strong>
                <SelectionBox
                  label={`Select ${item.exercise_name}`}
                  checked={complete}
                  partial={checked && !complete}
                  disabled={pending}
                  onChange={() => toggleExercise(item.id, !complete)}
                />
              </label>
              {item.sets.map((set, index) => (
                <label className="workout-share-set" key={set.id}>
                  <span className="workout-share-number">{index + 1}</span>
                  <span className="workout-share-values">
                    {setLabel(item, set)}
                  </span>
                  <span className="workout-share-status">
                    {set.is_completed ? "" : "Planned"}
                  </span>
                  <SelectionBox
                    label={`Select ${item.exercise_name} set ${index + 1}`}
                    checked={sets.has(set.id)}
                    disabled={pending}
                    onChange={() => {
                      const next = new Set(sets);
                      if (next.has(set.id)) next.delete(set.id);
                      else next.add(set.id);
                      setSets(next);
                      setExercises((current) => {
                        const ids = new Set(current);
                        if (item.sets.some((set) => next.has(set.id)))
                          ids.add(item.id);
                        else ids.delete(item.id);
                        return ids;
                      });
                      clearFeedback();
                    }}
                  />
                </label>
              ))}
              {!item.sets.length && (
                <p className="workout-note workout-share-empty">No sets yet</p>
              )}
            </section>
          );
        })}
        {!workout.exercises.length && (
          <p className="workout-note">No exercises yet</p>
        )}
      </div>
      {options && (
        <section
          id="workout-share-options"
          className="workout-share-options"
          aria-label="Export options"
        >
          <label>
            Format
            <select
              aria-label="Format"
              value={format}
              disabled={pending}
              onChange={(event) => {
                setFormat(event.target.value);
                clearFeedback();
              }}
            >
              <option value="text">Text summary</option>
              <option value="csv">CSV spreadsheet</option>
            </select>
          </label>
          <label className="workout-check">
            <input
              type="checkbox"
              checked={includeNotes}
              disabled={pending}
              onChange={(event) => {
                setIncludeNotes(event.target.checked);
                clearFeedback();
              }}
            />
            Include session notes and set comments
          </label>
          <label>
            Workout summary
            <textarea readOnly rows={7} value={summary} />
          </label>
          <button disabled={pending || empty} onClick={() => void copy()}>
            Copy summary
          </button>
          <p className="workout-note">
            Saved units are kept. CSV is a spreadsheet export.
          </p>
        </section>
      )}
      {targets && (
        <Modal
          labelledBy="workout-share-targets-title"
          className="workout-share-target-modal"
          onClose={() => setTargets(false)}
        >
          <h2 id="workout-share-targets-title">Share to</h2>
          <p className="workout-note">
            The system share sheet is unavailable here. Choose an app to
            continue.
          </p>
          <div className="workout-share-targets">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(summary)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
            <a
              href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(workout.name)}&body=${encodeURIComponent(summary)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Gmail
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(workout.name)}&body=${encodeURIComponent(summary)}`}
            >
              Email
            </a>
            <button
              onClick={() => {
                setTargets(false);
                void copy();
              }}
            >
              Copy summary
            </button>
          </div>
          <button onClick={() => setTargets(false)}>Back</button>
        </Modal>
      )}
      {empty && <p role="status">Select an exercise or set to share.</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="workout-share-footer">
        <button disabled={pending} onClick={onClose}>
          Cancel
        </button>
        <button
          disabled={pending}
          aria-expanded={options}
          aria-controls="workout-share-options"
          onClick={() => setOptions(!options)}
        >
          Options
        </button>
        <button
          className="primary-button"
          disabled={pending || empty}
          onClick={() => void share()}
        >
          {format === "csv" ? "Download CSV" : "Share"}
        </button>
      </div>
    </Modal>
  );
}
