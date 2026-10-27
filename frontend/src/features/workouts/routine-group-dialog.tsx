import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import { groupColours } from "./group-colours";
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
  const [membership, setMembership] = useState({
    name: item.group_name ?? "",
    colour: item.group_colour ?? groupColours[0][1],
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [colour, setColour] = useState<string>(groupColours[0][1]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const selectedGroup = useRef<HTMLButtonElement>(null);
  const newGroup = useRef<HTMLButtonElement>(null);
  const locked = busy || saving;
  const exercises = day.exercises.map((row) =>
    row.id === item.id
      ? { ...row, group_name: membership.name, group_colour: membership.colour }
      : row,
  );
  const groups = [
    ...new Set(
      exercises
        .map((row) => row.group_name)
        .filter((value): value is string => !!value),
    ),
  ];
  const members = (group: string) =>
    exercises.filter((row) => row.group_name === group);
  useEffect(() => {
    if (creating) nameInput.current?.focus();
    else (selectedGroup.current ?? newGroup.current)?.focus();
  }, [creating, membership.name]);
  function create() {
    let number = 1;
    while (groups.some((group) => group.toLowerCase() === `group ${number}`))
      number++;
    setName(`Group ${number}`);
    setColour(groupColours[groups.length % groupColours.length][1]);
    setError("");
    setCreating(true);
  }
  function save(group: string, groupColour: string) {
    setError("");
    setSaving(true);
    run(async () => {
      try {
        await api.reorderRoutineExercise(
          item.id,
          item.display_order,
          group,
          groupColour,
        );
        setMembership({ name: group, colour: groupColour });
        setCreating(false);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not save the group.",
        );
        throw cause;
      } finally {
        setSaving(false);
      }
    });
  }
  return (
    <Modal
      labelledBy="routine-group-title"
      className="routine-dialog routine-group-dialog"
      busy={locked}
      onClose={onClose}
    >
      <header className="routine-dialog-header">
        <h2 id="routine-group-title">{creating ? "New group" : "Groups"}</h2>
        <p>{item.exercise_name}</p>
      </header>
      {creating ? (
        <form
          className="routine-dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) {
              setError("Enter a group name.");
              return;
            }
            if (
              groups.some(
                (group) => group.toLowerCase() === trimmed.toLowerCase(),
              )
            ) {
              setError("Choose the existing group, or use a different name.");
              return;
            }
            save(trimmed, colour);
          }}
        >
          <div className="routine-dialog-body">
            <label>
              Group name
              <input
                ref={nameInput}
                value={name}
                required
                maxLength={120}
                disabled={locked}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <fieldset className="routine-group-palette" disabled={locked}>
              <legend>Group colour</legend>
              {groupColours.map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  aria-pressed={colour.toLowerCase() === value}
                  onClick={() => setColour(value)}
                >
                  <span
                    style={{
                      background: value,
                      color: label === "Amber" ? "#1b2b34" : "#ffffff",
                    }}
                    aria-hidden="true"
                  >
                    {colour.toLowerCase() === value ? "✓" : ""}
                  </span>
                </button>
              ))}
            </fieldset>
            <div className="routine-group-new-member">
              <span
                className="routine-group-colour-mark"
                style={{ background: colour }}
                aria-hidden="true"
              />
              <span>{item.exercise_name}</span>
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
          <footer className="routine-dialog-footer">
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                setCreating(false);
                setError("");
              }}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              aria-label="Save group"
              disabled={locked}
            >
              Save
            </button>
          </footer>
        </form>
      ) : (
        <>
          <div className="routine-dialog-body">
            <p className="workout-note">
              {groups.length
                ? "Tap a group to link this exercise. Tap its checked group to unlink it."
                : "No groups yet. Create one for exercises you perform together."}
            </p>
            <div className="routine-group-list">
              {groups.map((group) => {
                const groupMembers = members(group);
                const groupColour =
                  groupMembers[0]?.group_colour ?? groupColours[0][1];
                const selected = membership.name === group;
                return (
                  <button
                    key={group}
                    ref={selected ? selectedGroup : undefined}
                    type="button"
                    className="routine-group-row"
                    aria-pressed={selected}
                    disabled={locked}
                    style={{ borderInlineStartColor: groupColour }}
                    onClick={() => save(selected ? "" : group, groupColour)}
                  >
                    <span className="routine-group-description">
                      <strong>{group}</strong>
                      <small>
                        {groupMembers
                          .map((row) => row.exercise_name)
                          .join(" · ")}
                      </small>
                    </span>
                    <span
                      className={`routine-group-check${selected ? " is-selected" : ""}`}
                      aria-hidden="true"
                    >
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
          <footer className="routine-dialog-footer">
            <button disabled={locked} onClick={onClose}>
              Done
            </button>
            <button
              ref={newGroup}
              className="primary-button"
              disabled={locked}
              onClick={create}
            >
              New group
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
