import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

const colours = [
  ["Green", "#007f68"],
  ["Blue", "#2563eb"],
  ["Purple", "#9333ea"],
  ["Pink", "#db2777"],
  ["Orange", "#d97706"],
  ["Red", "#dc2626"],
] as const;

export function WorkoutGroups({
  workout,
  current,
  catalog,
  busy,
  run,
  onClose,
}: {
  workout: api.Workout;
  current: api.WorkoutExercise;
  catalog: api.WorkoutCatalog;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const groups = [
    ...new Set(workout.exercises.map((i) => i.group_name).filter(Boolean)),
  ] as string[];
  const [draft, setDraft] = useState<api.GroupInput | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const disabled = busy || pending;
  const members = (name: string) =>
    workout.exercises.filter((i) => i.group_name === name);
  function edit(name?: string) {
    let number = 1;
    while (groups.includes(`Superset ${number}`)) number++;
    setDraft({
      name: name ?? `Superset ${number}`,
      colour: name
        ? (members(name)[0].group_colour ?? colours[0][1])
        : colours[groups.length % colours.length][1],
      ...(name ? { original_name: name } : {}),
      member_ids: name ? members(name).map((i) => i.id) : [current.id],
      add_exercise_ids: [],
    });
    setError("");
    setConfirmDelete(false);
    setLibraryOpen(false);
  }
  function save(action: () => Promise<api.Workout>) {
    setPending(true);
    setError("");
    run(async () => {
      try {
        await action();
        onClose();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Group couldn't save. Please retry.",
        );
      } finally {
        setPending(false);
      }
    });
  }
  function unlink() {
    const name = current.group_name!;
    const remaining = members(name).filter((i) => i.id !== current.id);
    save(() =>
      remaining.length
        ? api.saveWorkoutGroup(workout.id, {
            original_name: name,
            name,
            colour: members(name)[0].group_colour ?? colours[0][1],
            member_ids: remaining.map((i) => i.id),
            add_exercise_ids: [],
          })
        : api.deleteWorkoutGroup(workout.id, name),
    );
  }
  return (
    <Modal labelledBy="workout-groups-title" busy={disabled} onClose={onClose}>
      <h2 id="workout-groups-title">
        {draft ? (draft.original_name ? "Edit group" : "New group") : "Groups"}
      </h2>
      {error && (
        <p role="alert" className="workout-error">
          {error}
        </p>
      )}
      {!draft ? (
        <>
          <p>Link exercises into a superset or circuit.</p>
          {!groups.length && <p>No groups in this workout yet.</p>}
          <div className="workout-stack">
            {groups.map((name) => (
              <div
                className="workout-inset workout-group-mark"
                key={name}
                style={{
                  borderInlineStartColor:
                    members(name)[0].group_colour ?? colours[0][1],
                }}
              >
                <strong>{name}</strong>
                <p>
                  {members(name)
                    .map((i) => i.exercise_name)
                    .join(" · ")}
                </p>
                <div className="workout-actions">
                  {current.group_name === name ? (
                    <span>Current exercise is in this group</span>
                  ) : (
                    <button
                      disabled={disabled}
                      onClick={() =>
                        save(() =>
                          api.saveWorkoutGroup(workout.id, {
                            original_name: name,
                            name,
                            colour:
                              members(name)[0].group_colour ?? colours[0][1],
                            member_ids: [
                              ...members(name).map((i) => i.id),
                              current.id,
                            ],
                            add_exercise_ids: [],
                          }),
                        )
                      }
                    >
                      Add to {name}
                    </button>
                  )}
                  <button disabled={disabled} onClick={() => edit(name)}>
                    Edit {name}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="workout-actions">
            <button
              disabled={disabled}
              className="primary-button"
              onClick={() => edit()}
            >
              New group
            </button>
            {current.group_name && (
              <button disabled={disabled} onClick={unlink}>
                Remove current exercise from group
              </button>
            )}
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(() => api.saveWorkoutGroup(workout.id, draft));
          }}
        >
          <label>
            Group name
            <input
              value={draft.name}
              maxLength={120}
              required
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <fieldset disabled={disabled} className="workout-group-colours">
            <legend>Group colour</legend>
            {colours.map(([label, colour]) => (
              <button
                key={colour}
                type="button"
                aria-label={label}
                aria-pressed={draft.colour === colour}
                onClick={() => setDraft({ ...draft, colour })}
              >
                <span style={{ background: colour }} aria-hidden="true" />
                {label}
              </button>
            ))}
          </fieldset>
          <fieldset disabled={disabled} className="workout-group-members">
            <legend>Exercises in this workout</legend>
            {workout.exercises.map((i) => (
              <label className="workout-check" key={i.id}>
                <input
                  type="checkbox"
                  checked={draft.member_ids.includes(i.id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      member_ids: e.target.checked
                        ? [...draft.member_ids, i.id]
                        : draft.member_ids.filter((id) => id !== i.id),
                    })
                  }
                />
                {i.exercise_name}
                {i.group_name && i.group_name !== draft.original_name && (
                  <small>Moves from {i.group_name}</small>
                )}
              </label>
            ))}
          </fieldset>
          <button
            disabled={disabled}
            type="button"
            onClick={() => setLibraryOpen(!libraryOpen)}
          >
            Add exercise to group
          </button>
          {libraryOpen && (
            <fieldset disabled={disabled} className="workout-group-members">
              <legend>Add from your library</legend>
              <label>
                Find exercise
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  type="search"
                />
              </label>
              {catalog.exercises
                .filter(
                  (e) =>
                    e.is_active &&
                    catalog.categories.some(
                      (c) => c.id === e.category_id && c.is_active,
                    ) &&
                    !workout.exercises.some((i) => i.exercise_id === e.id) &&
                    e.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((exercise) => (
                  <label className="workout-check" key={exercise.id}>
                    <input
                      type="checkbox"
                      checked={draft.add_exercise_ids.includes(exercise.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          add_exercise_ids: e.target.checked
                            ? [...draft.add_exercise_ids, exercise.id]
                            : draft.add_exercise_ids.filter(
                                (id) => id !== exercise.id,
                              ),
                        })
                      }
                    />
                    {exercise.name}
                  </label>
                ))}
              <small>
                New exercises are added to the workout only when you save.
              </small>
            </fieldset>
          )}
          <p className="workout-note">
            After a completed set, move to the next member in workout order and
            loop back for the next round.
          </p>
          <div className="workout-actions">
            <button
              className="primary-button"
              disabled={
                disabled ||
                !draft.name.trim() ||
                !(draft.member_ids.length + draft.add_exercise_ids.length)
              }
            >
              Save group
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Back to groups
            </button>
            {draft.original_name && (
              <button
                type="button"
                disabled={disabled}
                className="workout-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete group
              </button>
            )}
          </div>
          {confirmDelete && (
            <div className="workout-inset">
              <p>
                Unlink this group? Exercises and their sets will stay in the
                workout.
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  save(() =>
                    api.deleteWorkoutGroup(workout.id, draft.original_name!),
                  )
                }
              >
                Confirm group deletion
              </button>
            </div>
          )}
        </form>
      )}
      <button disabled={disabled} type="button" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
