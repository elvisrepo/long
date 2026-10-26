import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";
export function RoutineGroupDialog({
  item,
  day,
  busy,
  run,
  onClose,
}: {
  item: api.RoutineExercise;
  day: api.RoutineDay;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const groups = [
    ...new Set(
      day.exercises
        .map((row) => row.group_name)
        .filter((name): name is string => !!name),
    ),
  ];
  const [selected, setSelected] = useState(item.group_name ?? "");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(`Superset ${groups.length + 1}`);
  const [colour, setColour] = useState("#007f68");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = busy || saving;
  return (
    <Modal
      labelledBy="routine-group-title"
      className="routine-dialog"
      busy={locked}
      onClose={onClose}
    >
      <header className="routine-dialog-header">
        <h2 id="routine-group-title">Add to group</h2>
        <p>{item.exercise_name}</p>
      </header>
      <form
        className="routine-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          const group = creating ? name.trim() : selected;
          if (
            creating &&
            groups.some(
              (existing) => existing.toLowerCase() === group.toLowerCase(),
            )
          ) {
            setError("Choose the existing group, or use a different name.");
            return;
          }
          setError("");
          setSaving(true);
          run(async () => {
            try {
              await api.reorderRoutineExercise(
                item.id,
                item.display_order,
                group,
                creating
                  ? colour
                  : (day.exercises.find((row) => row.group_name === selected)
                      ?.group_colour ?? "#007f68"),
              );
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save the group.",
              );
              throw cause;
            } finally {
              setSaving(false);
            }
          });
        }}
      >
        <div className="routine-dialog-body">
          <fieldset className="routine-group-options" disabled={locked}>
            <legend className="visually-hidden">Group membership</legend>
            <label>
              <input
                type="radio"
                name="routine-group"
                checked={!creating && selected === ""}
                onChange={() => {
                  setCreating(false);
                  setSelected("");
                }}
              />
              <span>No group</span>
            </label>
            {groups.map((group) => (
              <label
                key={group}
                style={{
                  borderInlineStart: `3px solid ${day.exercises.find((row) => row.group_name === group)?.group_colour ?? "#007f68"}`,
                }}
              >
                <input
                  type="radio"
                  name="routine-group"
                  checked={!creating && selected === group}
                  onChange={() => {
                    setCreating(false);
                    setSelected(group);
                  }}
                />
                <span>
                  {group}
                  <small>
                    {day.exercises
                      .filter((row) => row.group_name === group)
                      .map((row) => row.exercise_name)
                      .join(" · ")}
                  </small>
                </span>
              </label>
            ))}
            <label>
              <input
                type="radio"
                name="routine-group"
                checked={creating}
                onChange={() => setCreating(true)}
              />
              <span>New group</span>
            </label>
          </fieldset>
          {creating && (
            <div className="workout-fields">
              <label>
                Group name
                <input
                  value={name}
                  required
                  maxLength={120}
                  disabled={locked}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Group colour
                <input
                  type="color"
                  value={colour}
                  disabled={locked}
                  onChange={(event) => setColour(event.target.value)}
                />
              </label>
            </div>
          )}
          <p className="workout-note">
            Grouped exercises form a superset or circuit within this day.
          </p>
          {error && <p role="alert">{error}</p>}
        </div>
        <footer className="routine-dialog-footer">
          <button type="button" disabled={locked} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={locked}>
            Save group
          </button>
        </footer>
      </form>
    </Modal>
  );
}
