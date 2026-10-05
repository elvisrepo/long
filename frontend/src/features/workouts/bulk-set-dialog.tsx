import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import { dayLabel, setLabel, type RunAction } from "./workout-navigation";

export function BulkSetDialog({
  workouts,
  exerciseId,
  busy,
  run,
  onClose,
  onRefresh,
}: {
  workouts: api.Workout[];
  exerciseId: string;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
  onRefresh: () => void;
}) {
  // Freeze the reviewed data: refetches must not silently replace expected values.
  const [rows] = useState(() =>
    workouts.flatMap((workout) =>
      workout.exercises
        .filter((i) => i.exercise_id === exerciseId)
        .flatMap((item, occurrence) =>
          item.sets.map((set, position) => ({
            workout,
            item,
            set,
            occurrence,
            position,
          })),
        ),
    ),
  );
  const [ids, setIds] = useState<string[]>([]);
  const [action, setAction] = useState<"update" | "delete">("update");
  const [preview, setPreview] = useState<api.BulkSetInput | null>(null);
  const [draft, setDraft] = useState<{
    partition: string;
    changes: api.SetInput;
  }>({ partition: "", changes: {} });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = pending || busy;
  const selected = rows.filter((r) => ids.includes(r.set.id));
  const first = selected[0]?.item;
  const countLabel = `${selected.length} ${selected.length === 1 ? "set" : "sets"}`;
  const partition = first
    ? `${first.tracking_type}-${first.weight_unit}-${first.distance_unit}`
    : "empty";
  const compatible = selected.every(
    ({ item }) =>
      item.tracking_type === first?.tracking_type &&
      item.weight_unit === first?.weight_unit &&
      item.distance_unit === first?.distance_unit,
  );
  const fields: {
    name: "weight" | "reps" | "distance" | "duration_seconds";
    label: string;
    min: number;
    max: number;
    step: number;
  }[] = !first
    ? []
    : first.tracking_type === "duration"
      ? [
          {
            name: "duration_seconds",
            label: "Duration (seconds)",
            min: 1,
            max: 2147483647,
            step: 1,
          },
        ]
      : first.tracking_type === "cardio"
        ? [
            {
              name: "distance",
              label: `Distance (${first.distance_unit})`,
              min: 0.001,
              max: 9999999.999,
              step: 0.001,
            },
            {
              name: "duration_seconds",
              label: "Duration (seconds)",
              min: 1,
              max: 2147483647,
              step: 1,
            },
          ]
        : [
            {
              name: "weight",
              label: `Weight (${first.weight_unit})`,
              min: 0,
              max: 9999999.999,
              step: 0.001,
            },
            { name: "reps", label: "Reps", min: 1, max: 100000, step: 1 },
          ];

  function review(form: HTMLFormElement) {
    if (locked || !selected.length || selected.length > 100) return;
    const data = new FormData(form);
    const sets = selected.map(({ set }) => ({ id: set.id, expected: set }));
    setError("");
    if (action === "delete") {
      setPreview({ action, sets });
      return;
    }
    const changes: api.SetInput = {};
    if (compatible)
      for (const { name } of fields) {
        const value = String(data.get(name) ?? "").trim();
        if (!value) continue;
        if (name === "weight" || name === "distance") changes[name] = value;
        else if (name === "reps" || name === "duration_seconds")
          changes[name] = Number(value);
      }
    if (data.get("completion") !== "keep")
      changes.is_completed = data.get("completion") === "completed";
    if (data.get("replace_comment"))
      changes.comment = String(data.get("comment") ?? "");
    if (!Object.keys(changes).length) {
      setError("Choose at least one change before previewing.");
      return;
    }
    setDraft({ partition, changes });
    setPreview({ action, sets, changes });
  }

  function apply() {
    if (locked || !preview) return;
    setPending(true);
    setError("");
    run(async () => {
      try {
        await api.bulkUpdateSets(preview);
        onClose();
      } catch (reason) {
        setError(
          `${reason instanceof Error ? reason.message : "Batch couldn't be saved."} Refresh history and review again before retrying.`,
        );
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <Modal labelledBy="bulk-title" onClose={onClose} busy={locked}>
      <h2 id="bulk-title">Edit multiple sets</h2>
      <p>
        Choose up to 100 sets from loaded exercise history. Finished workouts
        must be reopened first. Changes apply together, or not at all.
      </p>
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button disabled={locked} onClick={onRefresh}>
            Refresh history
          </button>
        </div>
      )}
      {preview ? (
        <>
          <section aria-label="Batch preview">
            <h3>
              {preview.action === "delete" ? "Delete" : "Update"} {countLabel}
            </h3>
            {preview.action === "delete" && (
              <p>
                These sets and their comments will be permanently removed.
                Exercises and workouts remain.
              </p>
            )}
            {selected.map(({ workout, item, set, occurrence, position }) => {
              const after =
                preview.action === "update"
                  ? { ...set, ...preview.changes }
                  : null;
              return (
                <div className="workout-inset" key={set.id}>
                  <h4>
                    {dayLabel(workout.performed_on)} ·{" "}
                    {workout.name || "Workout"}
                  </h4>
                  <p>
                    {item.exercise_name} · entry {occurrence + 1} · set{" "}
                    {position + 1}
                  </p>
                  <p>
                    Before: {setLabel(item, set)} ·{" "}
                    {set.is_completed ? "Completed" : "Planned"}
                  </p>
                  {set.comment && <p>Comment before: {set.comment}</p>}
                  {after ? (
                    <>
                      <p>
                        After: {setLabel(item, after)} ·{" "}
                        {after.is_completed ? "Completed" : "Planned"}
                      </p>
                      {preview.action === "update" &&
                        "comment" in preview.changes && (
                          <p>Comment after: {after.comment || "(cleared)"}</p>
                        )}
                    </>
                  ) : (
                    <p>After: Deleted</p>
                  )}
                </div>
              );
            })}
          </section>
          <div className="workout-actions">
            <button
              className={
                preview.action === "delete"
                  ? "workout-danger"
                  : "primary-button"
              }
              disabled={locked || !!error}
              onClick={apply}
            >
              {pending
                ? "Applying…"
                : preview.action === "delete"
                  ? `Delete ${countLabel}`
                  : `Apply to ${countLabel}`}
            </button>
            <button disabled={locked} onClick={() => setPreview(null)}>
              Back to selection
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            review(event.currentTarget);
          }}
        >
          <div className="workout-actions">
            <button
              type="button"
              disabled={locked}
              onClick={() =>
                setIds(
                  rows
                    .filter((r) => !r.workout.is_finished)
                    .slice(0, 100)
                    .map((r) => r.set.id),
                )
              }
            >
              Select all editable sets
            </button>
            <button
              type="button"
              disabled={locked || !ids.length}
              onClick={() => setIds([])}
            >
              Clear selection
            </button>
          </div>
          <p role="status">{ids.length} sets selected</p>
          {rows.map(({ workout, item, set, occurrence, position }) => (
            <label className="workout-inset workout-check" key={set.id}>
              <input
                type="checkbox"
                checked={ids.includes(set.id)}
                disabled={
                  locked ||
                  workout.is_finished ||
                  (ids.length >= 100 && !ids.includes(set.id))
                }
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, set.id]
                      : ids.filter((id) => id !== set.id),
                  )
                }
              />
              <span>
                {dayLabel(workout.performed_on)} · {workout.name || "Workout"} ·
                entry {occurrence + 1} · set {position + 1}:{" "}
                {setLabel(item, set)} ·{" "}
                {set.is_completed ? "Completed" : "Planned"}
                {workout.is_finished ? " · Finished — reopen to edit" : ""}
              </span>
            </label>
          ))}
          <fieldset disabled={locked}>
            <label>
              Action
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
              >
                <option value="update">Update selected sets</option>
                <option value="delete">Delete selected sets</option>
              </select>
            </label>
            {action === "update" && (
              <>
                <p>
                  Blank quantities leave existing values unchanged. Entered
                  values replace that field in every selected set.
                </p>
                {!compatible && (
                  <p>
                    Numeric edits require matching saved exercise types and
                    units. Select a matching group, or change only
                    completion/comments.
                  </p>
                )}
                <div className="workout-fields" key={partition}>
                  {fields.map((field) => (
                    <label key={field.name}>
                      {field.label}
                      <input
                        disabled={!compatible}
                        type="number"
                        name={field.name}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        defaultValue={
                          draft.partition === partition
                            ? (draft.changes[field.name] ?? undefined)
                            : undefined
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Completion
                  <select
                    name="completion"
                    defaultValue={
                      draft.changes.is_completed == null
                        ? "keep"
                        : draft.changes.is_completed
                          ? "completed"
                          : "planned"
                    }
                  >
                    <option value="keep">Keep existing status</option>
                    <option value="completed">Completed</option>
                    <option value="planned">Planned</option>
                  </select>
                </label>
                <label className="workout-check">
                  <input
                    type="checkbox"
                    name="replace_comment"
                    defaultChecked={"comment" in draft.changes}
                  />
                  Replace comments (blank clears them)
                </label>
                <label>
                  New comment
                  <textarea
                    name="comment"
                    maxLength={2000}
                    defaultValue={draft.changes.comment}
                  />
                </label>
              </>
            )}
          </fieldset>
          <button
            className="primary-button"
            disabled={locked || !ids.length}
            type="submit"
          >
            Preview changes
          </button>
        </form>
      )}
      <button disabled={locked} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
