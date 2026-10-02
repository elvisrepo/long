import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../components/modal";
import { useMeQuery } from "../auth/use-me-query";
import * as api from "./workout-api";
import { RoutineDayBuilder } from "./routine-day-builder";
import {
  dayLabel,
  setLabel,
  type NavigateWorkout,
  type RunAction,
} from "./workout-navigation";

// Keep write failures visible inside a modal, not behind the dialog's inert page.
function useRoutineAction(run: RunAction) {
  const [error, setError] = useState("");
  return {
    error,
    execute: (action: () => Promise<void>) => {
      setError("");
      run(async () => {
        try {
          await action();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The routine could not be saved.",
          );
          throw cause;
        }
      });
    },
  };
}

export function SaveRoutineDayDialog({
  workout,
  busy,
  run,
  onClose,
}: {
  workout: api.Workout;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const owner = useMeQuery().data?.email;
  const query = useQuery({
    queryKey: ["workouts", owner, "routines"],
    queryFn: api.getWorkoutRoutines,
    enabled: !!owner,
  });
  const [routineId, setRoutineId] = useState("");
  const [createdId, setCreatedId] = useState<string>();
  const [dayId, setDayId] = useState("");
  const [name, setName] = useState(workout.name);
  const [notes, setNotes] = useState("");
  const [order, setOrder] = useState(100);
  const { error, execute } = useRoutineAction(run);
  const selected = query.data?.find((r) => r.id === routineId);
  const pending = busy || query.isFetching;
  return (
    <Modal labelledBy="save-routine-day" busy={busy} onClose={onClose}>
      <h2 id="save-routine-day">Save as routine day</h2>
      <p>
        Save these exercises and quantities as a reusable plan. Completion,
        performance comments and session notes are not copied.
      </p>
      {query.isPending ? (
        <p role="status">Loading routines…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Routines couldn't load.</p>
          <button onClick={() => void query.refetch()}>Retry routines</button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            execute(async () => {
              let target = routineId || createdId;
              if (!target) {
                const saved = await api.saveWorkoutRoutine(undefined, {
                  name: String(fd.get("routine-name")).trim(),
                });
                target = saved.id;
                setCreatedId(saved.id);
              }
              await api.saveRoutineDay(target, dayId || undefined, {
                name: name.trim(),
                notes,
                display_order: order,
                source_workout_id: workout.id,
              });
              onClose();
            });
          }}
        >
          <label>
            Routine
            <select
              value={routineId}
              disabled={pending}
              onChange={(e) => {
                setRoutineId(e.target.value);
                setDayId("");
                setCreatedId(undefined);
                setName(workout.name);
                setNotes("");
                setOrder(100);
              }}
            >
              <option value="">New routine…</option>
              {query.data
                .filter((r) => r.is_active)
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </label>
          {!routineId && (
            <label>
              New routine name
              <input
                name="routine-name"
                required
                maxLength={120}
                disabled={pending || !!createdId}
              />
            </label>
          )}
          {selected && (
            <label>
              Day template
              <select
                value={dayId}
                disabled={pending}
                onChange={(e) => {
                  const day = selected.days.find(
                    (d) => d.id === e.target.value,
                  );
                  setDayId(e.target.value);
                  setName(day?.name || workout.name);
                  setNotes(day?.notes || "");
                  setOrder(day?.display_order ?? 100);
                }}
              >
                <option value="">New day…</option>
                {selected.days.map((d) => (
                  <option value={d.id} key={d.id}>
                    Replace {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Day name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              disabled={pending}
            />
          </label>
          <label>
            Day instructions
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              disabled={pending}
            />
          </label>
          <label>
            Day order
            <input
              type="number"
              min="0"
              max="2147483647"
              step="1"
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
              required
              disabled={pending}
            />
          </label>
          {dayId && (
            <p>
              This replaces the template's exercises and sets. Existing workout
              sessions stay unchanged.
            </p>
          )}
          {createdId && (
            <p>
              The routine was created. Retry saving the day; no second routine
              will be created.
            </p>
          )}
          {error && (
            <p role="alert" className="workout-error">
              {error}
            </p>
          )}
          <button disabled={pending} className="primary-button">
            {dayId ? "Replace routine day" : "Save routine day"}
          </button>
        </form>
      )}
      <button disabled={busy} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}

export function WorkoutRoutines({
  owner,
  day,
  busy,
  run,
  navigate,
}: {
  owner: string;
  day: string;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
}) {
  const query = useQuery({
    queryKey: ["workouts", owner, "routines"],
    queryFn: api.getWorkoutRoutines,
  });
  const [archives, setArchives] = useState(false);
  const [routineEditor, setRoutineEditor] = useState<
    api.WorkoutRoutine | null | undefined
  >();
  const [dayEditor, setDayEditor] = useState<api.RoutineDay>();
  const [newDayRoutine, setNewDayRoutine] = useState<string>();
  const pending = busy || query.isFetching;
  const routines = query.data?.filter((r) => archives || r.is_active) ?? [];
  return (
    <>
      <div className="workout-toolbar">
        <button
          className="primary-button"
          disabled={pending}
          onClick={() => setRoutineEditor(null)}
        >
          New routine
        </button>
        <label className="workout-check">
          <input
            type="checkbox"
            checked={archives}
            onChange={(e) => setArchives(e.target.checked)}
          />
          Show archived routines
        </label>
      </div>
      {query.isPending ? (
        <p role="status">Loading routines…</p>
      ) : query.isError ? (
        <>
          <p role="alert">
            Routines couldn't load. No empty catalog is assumed.
          </p>
          <button onClick={() => void query.refetch()}>Retry routines</button>
        </>
      ) : (
        <>
          {!routines.length && (
            <section className="workout-card workout-empty">
              <h2>Build a repeatable plan</h2>
              <p>
                Create a routine and add days, or save an existing workout as a
                template.
              </p>
              <button onClick={() => navigate({ view: "home", date: day })}>
                Choose a saved workout
              </button>
            </section>
          )}
          <div className="workout-stack">
            {routines.map((r) => (
              <section key={r.id} className="workout-card">
                <div className="workout-card-heading">
                  <h2>{r.name}</h2>
                  <span className="workout-badge">
                    {r.is_active ? "Routine" : "Archived"}
                  </span>
                </div>
                {r.notes && <p>{r.notes}</p>}
                <div className="workout-actions">
                  <button
                    disabled={pending || !r.is_active}
                    onClick={() => setNewDayRoutine(r.id)}
                  >
                    Add routine day
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => setRoutineEditor(r)}
                  >
                    Edit routine
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await api.saveWorkoutRoutine(r.id, {
                          is_active: !r.is_active,
                        });
                      })
                    }
                  >
                    {r.is_active ? "Archive routine" : "Restore routine"}
                  </button>
                </div>
                {!r.days.length && (
                  <p>No days yet. Add your first routine day.</p>
                )}
                <div className="workout-library-grid" style={{ marginTop: 16 }}>
                  {r.days.map((d) => (
                    <section key={d.id} className="workout-inset">
                      <h3>{d.name}</h3>
                      {d.notes && <p>{d.notes}</p>}
                      {d.exercises.map((i) => (
                        <div key={i.id}>
                          <strong>{i.exercise_name}</strong>
                          {i.group_name && <small> · {i.group_name}</small>}
                          <p>
                            {i.sets.length
                              ? i.sets.map((s) => setLabel(i, s)).join(" / ")
                              : "No planned sets"}
                          </p>
                        </div>
                      ))}
                      <div className="workout-actions">
                        <button
                          className="primary-button"
                          disabled={pending || !r.is_active}
                          onClick={() =>
                            run(async () => {
                              const w = await api.startRoutineDay(d.id, day);
                              navigate({ view: "home", date: w.performed_on });
                            })
                          }
                        >
                          Start {d.name}
                        </button>
                        <button
                          disabled={pending || !r.is_active}
                          onClick={() => setDayEditor(d)}
                        >
                          Edit day
                        </button>
                      </div>
                      <small>Start on {dayLabel(day)}</small>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {routineEditor !== undefined && (
        <RoutineEditor
          routine={routineEditor}
          busy={busy}
          run={run}
          onClose={() => setRoutineEditor(undefined)}
        />
      )}
      {dayEditor && (
        <DayEditor
          day={
            query.data
              ?.flatMap((r) => r.days)
              .find((d) => d.id === dayEditor.id) ?? dayEditor
          }
          busy={busy}
          run={run}
          onClose={() => setDayEditor(undefined)}
        />
      )}
      {newDayRoutine && (
        <NewDayEditor
          routineId={newDayRoutine}
          busy={busy}
          run={run}
          onClose={() => setNewDayRoutine(undefined)}
        />
      )}
    </>
  );
}

function RoutineEditor({
  routine,
  busy,
  run,
  onClose,
}: {
  routine: api.WorkoutRoutine | null;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const { error, execute } = useRoutineAction(run);
  return (
    <Modal labelledBy="routine-editor" busy={busy} onClose={onClose}>
      <h2 id="routine-editor">{routine ? "Edit routine" : "New routine"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          execute(async () => {
            await api.saveWorkoutRoutine(routine?.id, {
              name: String(fd.get("name")).trim(),
              notes: String(fd.get("notes")),
              display_order: Number(fd.get("order")),
            });
            onClose();
          });
        }}
      >
        <label>
          Routine name
          <input
            name="name"
            defaultValue={routine?.name || ""}
            required
            maxLength={120}
            disabled={busy}
          />
        </label>
        <label>
          Routine notes
          <textarea
            name="notes"
            defaultValue={routine?.notes || ""}
            maxLength={2000}
            disabled={busy}
          />
        </label>
        <label>
          Routine order
          <input
            name="order"
            type="number"
            min="0"
            max="2147483647"
            step="1"
            defaultValue={routine?.display_order ?? 100}
            required
            disabled={busy}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>
          Save routine
        </button>
      </form>
      <button disabled={busy} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}

function DayEditor({
  day,
  busy,
  run,
  onClose,
}: {
  day: api.RoutineDay;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const { error, execute } = useRoutineAction(run);
  return (
    <Modal labelledBy="routine-day-editor" busy={busy} onClose={onClose}>
      <h2 id="routine-day-editor">
        {confirm ? "Remove routine day?" : "Edit routine day"}
      </h2>
      {confirm ? (
        <>
          <p>
            This removes the template and its sets. Already-created workouts are
            kept.
          </p>
          <button
            className="workout-danger"
            disabled={busy}
            onClick={() =>
              execute(async () => {
                await api.removeRoutineDay(day.id);
                onClose();
              })
            }
          >
            Confirm day removal
          </button>
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              execute(async () => {
                await api.saveRoutineDay("", day.id, {
                  name: String(fd.get("name")).trim(),
                  notes: String(fd.get("notes")),
                  display_order: Number(fd.get("order")),
                });
                onClose();
              });
            }}
          >
            <label>
              Day name
              <input
                name="name"
                defaultValue={day.name}
                required
                maxLength={120}
                disabled={busy}
              />
            </label>
            <label>
              Day instructions
              <textarea
                name="notes"
                defaultValue={day.notes}
                maxLength={2000}
                disabled={busy}
              />
            </label>
            <label>
              Day order
              <input
                name="order"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                defaultValue={day.display_order}
                required
                disabled={busy}
              />
            </label>
            <button className="primary-button" disabled={busy}>
              Save day details
            </button>
          </form>
          <RoutineDayBuilder day={day} busy={busy} run={run} />
          <button
            className="workout-danger"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Remove routine day
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}

function NewDayEditor({
  routineId,
  busy,
  run,
  onClose,
}: {
  routineId: string;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const { error, execute } = useRoutineAction(run);
  return (
    <Modal labelledBy="new-routine-day" busy={busy} onClose={onClose}>
      <h2 id="new-routine-day">New routine day</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          execute(async () => {
            await api.saveRoutineDay(routineId, undefined, {
              name: String(fd.get("name")).trim(),
              notes: "",
              display_order: 100,
            });
            onClose();
          });
        }}
      >
        <label>
          Day name
          <input name="name" required maxLength={120} disabled={busy} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>
          Create day
        </button>
      </form>
      <button onClick={onClose} disabled={busy}>
        Cancel
      </button>
    </Modal>
  );
}
