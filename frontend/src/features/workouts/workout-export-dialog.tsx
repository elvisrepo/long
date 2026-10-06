import { useState } from "react";
import { Modal } from "../../components/modal";
import type { Workout } from "./workout-api";
import { downloadWorkoutCsv, workoutSummary } from "./workout-export";

export function WorkoutExportDialog({
  workout,
  onClose,
}: {
  workout: Workout;
  onClose: () => void;
}) {
  const [includeNotes, setIncludeNotes] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const summary = workoutSummary(workout, includeNotes);
  async function copy() {
    setPending(true);
    setMessage("");
    setError("");
    try {
      await navigator.clipboard.writeText(summary);
      setMessage("Summary copied to clipboard.");
    } catch {
      setError("Clipboard unavailable. Select and copy the preview manually.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal labelledBy="workout-export-title" busy={pending} onClose={onClose}>
      <h2 id="workout-export-title">Export workout</h2>
      <p>
        Preview this full workout, including planned sets and empty exercises.
        Saved units are kept; no conversion is applied.
      </p>
      <p className="workout-note">
        Nothing is published or sent automatically. Review personal details
        before sharing. CSV is a spreadsheet export, not a restorable backup.
      </p>
      <label>
        <input
          type="checkbox"
          checked={includeNotes}
          disabled={pending}
          onChange={(event) => {
            setIncludeNotes(event.target.checked);
            setMessage("");
            setError("");
          }}
        />{" "}
        Include session notes and set comments
      </label>
      <label>
        Workout summary
        <textarea readOnly rows={12} value={summary} />
      </label>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="workout-actions">
        <button
          disabled={pending}
          onClick={() => {
            setMessage("");
            setError("");
            try {
              downloadWorkoutCsv(workout, includeNotes);
              setMessage(
                "CSV download requested. Check your downloads folder.",
              );
            } catch {
              setError("CSV download failed. Please try again.");
            }
          }}
        >
          Download CSV
        </button>
        <button disabled={pending} onClick={() => void copy()}>
          Copy summary
        </button>
        <button disabled={pending} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
