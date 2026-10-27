import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../components/modal";
import { useMeQuery } from "../auth/use-me-query";
import * as api from "./workout-api";
import { RoutineDayBuilder } from "./routine-day-builder";
import { RoutineStartDialog } from "./routine-start-dialog";
import {
  RoutineActions,
  RoutineCopyDialog,
  RoutineDeleteDialog,
} from "./routine-actions";
import { RoutineOrderDialog } from "./routine-order-dialog";
import { type NavigateWorkout, type RunAction } from "./workout-navigation";

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
  const storageKey = `longevity:routine:${owner}`;
  const [choice, setChoice] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });
  const choose = (id: string) => {
    setChoice(id);
    setFreshDay(undefined);
    setEditing(false);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      /* Selection still works when storage is unavailable. */
    }
  };
  const [editing, setEditing] = useState(false);
  const [help, setHelp] = useState(false);
  const [archives, setArchives] = useState(false);
  const [routineEditor, setRoutineEditor] = useState<
    api.WorkoutRoutine | null | undefined
  >();
  const [dayEditor, setDayEditor] = useState<api.RoutineDay>();
  const [freshDay, setFreshDay] = useState<string>();
  const [startDay, setStartDay] = useState<api.RoutineDay>();
  const [newDayRoutine, setNewDayRoutine] = useState<string>();
  const [copying, setCopying] = useState<api.WorkoutRoutine>();
  const [deleting, setDeleting] = useState<api.WorkoutRoutine>();
  const [ordering, setOrdering] = useState<api.WorkoutRoutine>();
  const pending = busy || query.isFetching;
  const plans = query.data ?? [];
  const routine =
    plans.find((row) => row.id === choice) ??
    plans.find((row) => row.is_active);
  const all = choice === "all";
  return (
    <section className="routine-workspace" aria-label="Routines">
      <h1 className="visually-hidden">Routines</h1>
      <div className="routine-toolbar">
        <label className="routine-selector">
          <span className="visually-hidden">Browse routines</span>
          <select
            aria-label="Browse routines"
            value={all ? "all" : (routine?.id ?? "")}
            disabled={pending}
            onChange={(event) => {
              const id = event.target.value;
              if (id === "new") setRoutineEditor(null);
              else if (id === "library")
                navigate({ view: "exercises", date: day });
              else choose(id);
            }}
          >
            {!routine && <option value="">Routines</option>}
            {plans
              .filter((row) => row.is_active || row.id === routine?.id)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.is_active ? "" : " (archived)"}
                </option>
              ))}
            <option value="all">All routines</option>
            <option value="library">All exercises</option>
            <option value="new">Create new routine…</option>
          </select>
        </label>
        <button
          aria-label="Routine info"
          title="Routine info"
          onClick={() => setHelp(true)}
        >
          Info
        </button>
        {routine && !all && (
          <>
            <button
              aria-label={
                editing ? "Done editing routine" : "Edit routine exercises"
              }
              disabled={pending || !routine.is_active}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Done" : "Edit"}
            </button>
            <RoutineActions
              routine={routine}
              busy={pending}
              onEdit={() => setRoutineEditor(routine)}
              onCopy={() => setCopying(routine)}
              onDelete={() => setDeleting(routine)}
              onOrder={() => setOrdering(routine)}
              onArchive={() =>
                run(async () => {
                  await api.saveWorkoutRoutine(routine.id, {
                    is_active: !routine.is_active,
                  });
                  choose("all");
                  setArchives(true);
                })
              }
            />
          </>
        )}
      </div>
      {query.isPending ? (
        <p role="status">Loading routines…</p>
      ) : query.isError ? (
        <>
          <p role="alert">
            Routines couldn't load. Your plans have not changed.
          </p>
          <button onClick={() => void query.refetch()}>Retry routines</button>
        </>
      ) : all ? (
        <section className="routine-library">
          <div className="workout-card-heading">
            <h2>All routines</h2>
            <button onClick={() => setRoutineEditor(null)}>New routine</button>
          </div>
          <label className="workout-check">
            <input
              type="checkbox"
              checked={archives}
              onChange={(event) => setArchives(event.target.checked)}
            />
            Show archived routines
          </label>
          {plans
            .filter((row) => archives || row.is_active)
            .map((row) => (
              <button
                className="routine-plan-link"
                key={row.id}
                onClick={() => choose(row.id)}
              >
                <strong>{row.name}</strong>
                <small>
                  {row.days.length} days{row.is_active ? "" : " · Archived"}
                </small>
                <span aria-hidden="true">›</span>
              </button>
            ))}
        </section>
      ) : !routine ? (
        <section className="workout-empty">
          <h2>Create your first routine</h2>
          <p>Save exercises as days, such as Push, Pull and Legs.</p>
          <button
            className="primary-button"
            onClick={() => setRoutineEditor(null)}
          >
            New routine
          </button>
          <button onClick={() => navigate({ view: "home", date: day })}>
            Choose a saved workout
          </button>
        </section>
      ) : (
        <>
          {!routine.is_active && (
            <p role="status">
              Archived routine. Restore it from the routine actions to make
              changes.
            </p>
          )}
          {!routine.days.length && (
            <p>No days yet. Add your first day to choose exercises.</p>
          )}
          <div className="routine-days">
            {routine.days.map((d) => (
              <RoutineDayBuilder
                key={d.id}
                day={d}
                busy={pending || !routine.is_active}
                editing={editing}
                initialPicker={freshDay === d.id}
                run={run}
                onDayDetails={() => setDayEditor(d)}
                onStart={() => setStartDay(d)}
                onOpenLibrary={() => navigate({ view: "exercises", date: day })}
              />
            ))}
          </div>
          {(editing || !routine.days.length) && (
            <div className="routine-edit-actions">
              <button
                disabled={pending || !routine.is_active}
                aria-label="Add day"
                onClick={() => setNewDayRoutine(routine.id)}
              >
                ＋ Add day
              </button>
            </div>
          )}
        </>
      )}
      {help && (
        <Modal labelledBy="routine-info" onClose={() => setHelp(false)}>
          <h2 id="routine-info">Routine info</h2>
          {routine?.notes && <p>{routine.notes}</p>}
          <p>
            A routine is a reusable plan. Each day contains exercises and
            optional predefined sets. Start a day to preview a separate planned
            workout.
          </p>
          <p>
            Blank quantities stay unknown. You can choose to fill them from
            earlier completed sets when starting. Editing or removing a template
            keeps existing workouts unchanged.
          </p>
          <button onClick={() => setHelp(false)}>Close</button>
        </Modal>
      )}
      {routineEditor !== undefined && (
        <RoutineEditor
          routine={routineEditor}
          busy={busy}
          run={run}
          onClose={() => setRoutineEditor(undefined)}
          onCreated={(created) => {
            choose(created.id);
            setEditing(true);
            setRoutineEditor(undefined);
            setNewDayRoutine(created.id);
          }}
        />
      )}
      {copying && (
        <RoutineCopyDialog
          routine={copying}
          onCopied={(created) => choose(created.id)}
          busy={busy}
          run={run}
          onClose={() => setCopying(undefined)}
        />
      )}
      {deleting && (
        <RoutineDeleteDialog
          routine={deleting}
          busy={busy}
          run={run}
          onClose={() => setDeleting(undefined)}
        />
      )}
      {ordering && (
        <RoutineOrderDialog
          kind="days"
          parentId={ordering.id}
          items={ordering.days.map((row) => ({ id: row.id, name: row.name }))}
          busy={busy}
          run={run}
          onClose={() => setOrdering(undefined)}
        />
      )}
      {startDay && (
        <RoutineStartDialog
          owner={owner}
          dayId={startDay.id}
          destination={day}
          busy={busy}
          run={run}
          navigate={navigate}
          onClose={() => setStartDay(undefined)}
        />
      )}
      {dayEditor && (
        <DayEditor
          day={
            plans
              .flatMap((row) => row.days)
              .find((row) => row.id === dayEditor.id) ?? dayEditor
          }
          busy={busy}
          run={run}
          onClose={() => setDayEditor(undefined)}
        />
      )}
      {newDayRoutine && (
        <NewDayEditor
          routineId={newDayRoutine}
          displayOrder={
            Math.max(
              0,
              ...(plans
                .find((row) => row.id === newDayRoutine)
                ?.days.map((row) => row.display_order) ?? []),
            ) + 10
          }
          busy={busy}
          run={run}
          onClose={() => setNewDayRoutine(undefined)}
          onCreated={(created) => {
            setNewDayRoutine(undefined);
            setEditing(true);
            setFreshDay(created.id);
          }}
        />
      )}
    </section>
  );
}

function RoutineEditor({
  routine,
  busy,
  run,
  onClose,
  onCreated,
}: {
  routine: api.WorkoutRoutine | null;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
  onCreated: (routine: api.WorkoutRoutine) => void;
}) {
  const { error, execute } = useRoutineAction(run);
  return (
    <Modal
      labelledBy="routine-editor"
      className="routine-dialog"
      busy={busy}
      onClose={onClose}
    >
      <header className="routine-dialog-header">
        <h2 id="routine-editor">{routine ? "Edit routine" : "New routine"}</h2>
      </header>
      <form
        className="routine-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          execute(async () => {
            const saved = await api.saveWorkoutRoutine(routine?.id, {
              name: String(fd.get("name")).trim(),
              notes: String(fd.get("notes")),
              display_order: routine?.display_order ?? 100,
            });
            if (routine) onClose();
            else onCreated(saved);
          });
        }}
      >
        <div className="routine-dialog-body">
          <label>
            Routine name
            <input
              name="name"
              defaultValue={routine?.name ?? ""}
              required
              maxLength={120}
              disabled={busy}
            />
          </label>
          <label>
            Routine notes
            <textarea
              name="notes"
              defaultValue={routine?.notes ?? ""}
              maxLength={2000}
              disabled={busy}
            />
          </label>
          {error && <p role="alert">{error}</p>}
        </div>
        <footer className="routine-dialog-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            Save routine
          </button>
        </footer>
      </form>
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
    <Modal
      labelledBy="routine-day-editor"
      className="routine-dialog"
      busy={busy}
      onClose={onClose}
    >
      <header className="routine-dialog-header">
        <h2 id="routine-day-editor">
          {confirm ? "Remove routine day?" : "Day details"}
        </h2>
      </header>
      {confirm ? (
        <>
          <div className="routine-dialog-body">
            <p>
              Remove {day.name} and its exercise templates? Existing workouts
              are kept.
            </p>
            {error && <p role="alert">{error}</p>}
          </div>
          <footer className="routine-dialog-footer">
            <button disabled={busy} onClick={() => setConfirm(false)}>
              Keep day
            </button>
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
          </footer>
        </>
      ) : (
        <form
          className="routine-dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            execute(async () => {
              await api.saveRoutineDay("", day.id, {
                name: String(fd.get("name")).trim(),
                notes: String(fd.get("notes")),
                display_order: day.display_order,
              });
              onClose();
            });
          }}
        >
          <div className="routine-dialog-body">
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
            <button
              type="button"
              className="workout-danger"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              Remove routine day
            </button>
            {error && <p role="alert">{error}</p>}
          </div>
          <footer className="routine-dialog-footer">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={busy}>
              Save day details
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
function NewDayEditor({
  routineId,
  displayOrder,
  busy,
  run,
  onClose,
  onCreated,
}: {
  routineId: string;
  displayOrder: number;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
  onCreated: (day: api.RoutineDay) => void;
}) {
  const { error, execute } = useRoutineAction(run);
  return (
    <Modal
      labelledBy="new-routine-day"
      className="routine-dialog"
      busy={busy}
      onClose={onClose}
    >
      <header className="routine-dialog-header">
        <h2 id="new-routine-day">Add day</h2>
      </header>
      <form
        className="routine-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          const name = String(
            new FormData(event.currentTarget).get("name"),
          ).trim();
          execute(async () => {
            const created = await api.saveRoutineDay(routineId, undefined, {
              name,
              notes: "",
              display_order: displayOrder,
            });
            onCreated(created);
          });
        }}
      >
        <div className="routine-dialog-body">
          <label>
            Day name
            <input
              name="name"
              placeholder="Push, Pull, Legs…"
              required
              maxLength={120}
              disabled={busy}
            />
          </label>
          {error && <p role="alert">{error}</p>}
        </div>
        <footer className="routine-dialog-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            Create day
          </button>
        </footer>
      </form>
    </Modal>
  );
}
