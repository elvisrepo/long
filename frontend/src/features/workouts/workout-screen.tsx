import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { PageState } from "../../components/page-state";
import { Modal } from "../../components/modal";
import { WorkoutExportDialog } from "./workout-export-dialog";
import { WorkoutTiming } from "./workout-timing";
import { useMeQuery } from "../auth/use-me-query";
import * as api from "./workout-api";
import {
  dayLabel,
  localDay,
  setLabel,
  shiftDay,
  type NavigateWorkout,
  type RunAction,
  type WorkoutSearch,
} from "./workout-navigation";
import { WorkoutLibrary } from "./workout-library";
import { RemoveWorkoutExercise } from "./remove-workout-exercise";
import { WorkoutOrderControls } from "./workout-order-controls";
import { WorkoutTraining } from "./workout-training";
import { RestTimer, type RestTimerHandle } from "./rest-timer";
import { WorkoutCalendar } from "./workout-calendar";
import { CopyWorkoutPicker } from "./copy-workout-picker";
import { CopyWorkoutDialog } from "./copy-workout-dialog";
import { WorkoutProgress } from "./workout-progress";
import { WorkoutOverview } from "./workout-overview";
import { WorkoutRoutines, SaveRoutineDayDialog } from "./workout-routines";
import "./workout.css";

export function WorkoutScreen({
  search,
  onNavigate,
}: {
  search: WorkoutSearch;
  onNavigate: NavigateWorkout;
}) {
  const owner = useMeQuery().data?.email;
  const client = useQueryClient();
  const day = search.date || localDay(new Date());
  const view = search.view || "home";
  const restTimer = useRef<RestTimerHandle>(null);
  const catalog = useQuery({
    queryKey: ["workouts", owner, "catalog"],
    queryFn: api.getWorkoutCatalog,
    enabled: !!owner,
  });
  const sessions = useQuery({
    queryKey: ["workouts", owner, "day", day],
    queryFn: () => api.getWorkoutRange(day, day),
    enabled: !!owner && view === "home",
  });
  const detail = useQuery({
    queryKey: ["workouts", owner, "session", search.session],
    queryFn: () => api.getWorkout(search.session!),
    enabled:
      !!owner &&
      !!search.session &&
      (view === "training" || view === "exercises"),
  });
  const mutation = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workouts", owner] }),
  });
  const busy =
    mutation.isPending ||
    catalog.isFetching ||
    sessions.isFetching ||
    detail.isFetching;
  const run: RunAction = (action) => mutation.mutate(action);
  const navigate: NavigateWorkout = (next) => {
    mutation.reset();
    onNavigate(next);
  };
  if (!owner || catalog.isPending)
    return <PageState message="Loading workouts…" />;
  if (catalog.isError)
    return (
      <div className="workout-screen">
        <PageState
          message="Exercise library couldn't load. Your data has not been changed."
          error
        />
        <button onClick={() => void catalog.refetch()}>Retry library</button>
      </div>
    );
  const selectExercise = (id: string) =>
    run(async () => {
      if (!search.session) return;
      const session = await api.getWorkout(search.session);
      const matches = session.exercises.filter((i) => i.exercise_id === id);
      const item =
        matches.find((i) => i.sets.length > 0) ??
        matches[0] ??
        (await api.addWorkoutExercise(session.id, id));
      onNavigate({
        view: "training",
        date: session.performed_on,
        session: session.id,
        exercise: item.id,
      });
    });
  const start = () =>
    run(async () => {
      await api.initializeWorkoutCatalog();
      const session = await api.createWorkout(day);
      onNavigate({ view: "exercises", date: day, session: session.id });
    });
  const selectDate = (date: string) =>
    navigate({
      view,
      date,
      ...((view === "progress" || view === "history" || view === "overview") &&
      search.exercise
        ? { exercise: search.exercise }
        : {}),
    });
  return (
    <div className="workout-screen">
      <nav className="workout-tabs" aria-label="Workout navigation">
        {(
          [
            ["home", "Home"],
            ["exercises", "All exercises"],
            ["history", "History"],
            ["routines", "Routines"],
            ["calendar", "Calendar"],
            ["progress", "Progress"],
          ] as const
        ).map(([target, label]) => (
          <button
            key={target}
            disabled={busy}
            aria-pressed={view === target}
            onClick={() =>
              navigate({
                view: target,
                date: day,
              })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {mutation.isError && (
        <p role="alert" className="workout-error">
          {mutation.error.message}
        </p>
      )}
      <div hidden={view !== "training"}>
        <RestTimer
          ref={restTimer}
          seconds={
            catalog.data.exercises.find(
              (e) =>
                e.id ===
                detail.data?.exercises.find((i) => i.id === search.exercise)
                  ?.exercise_id,
            )?.rest_seconds ?? 90
          }
          context={search.exercise ?? ""}
          autoStart={catalog.data.preferences?.auto_start_rest ?? false}
          onAutoStartChange={(enabled) =>
            run(async () => {
              await api.saveWorkoutPreferences({ auto_start_rest: enabled });
            })
          }
          disabled={busy}
        />
      </div>
      {view !== "training" && (
        <PageHeader
          title={
            view === "overview"
              ? "Exercise overview"
              : view === "exercises"
                ? "All exercises"
                : view === "routines"
                  ? "Routines"
                  : view === "calendar"
                    ? "Workout calendar"
                    : view === "progress"
                      ? "Workout progress"
                      : view === "history"
                        ? "Workout history"
                        : "Workouts"
          }
          eyebrow={
            view === "exercises" ? "PERSONAL LIBRARY" : "TRAIN THOUGHTFULLY"
          }
          description={
            view === "overview"
              ? "History, graphs, records, statistics and goals for one exercise."
              : view === "exercises"
                ? search.session
                  ? "Select an exercise to add to this workout, or open one already included."
                  : "Browse your exercise library, history and progress. No workout is created here."
                : view === "routines"
                  ? "Organize training plans and start reusable workout templates."
                  : view === "calendar"
                    ? "Browse training and plans by month."
                    : view === "progress"
                      ? "Review completed training without mixing saved units."
                      : view === "history"
                        ? "Review recorded sessions or copy one as a new plan."
                        : "Record your training, one set at a time."
          }
        />
      )}
      {view !== "training" && (
        <div className="workout-date-controls date-navigation">
          <button
            aria-label="Previous day"
            disabled={busy}
            onClick={() => selectDate(shiftDay(day, -1))}
          >
            ←
          </button>
          <label>
            Tracking date
            <input
              type="date"
              value={day}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) selectDate(e.target.value);
              }}
            />
          </label>
          <button
            aria-label="Next day"
            disabled={busy}
            onClick={() => selectDate(shiftDay(day, 1))}
          >
            →
          </button>
          <button
            disabled={busy}
            onClick={() => selectDate(localDay(new Date()))}
          >
            Today
          </button>
        </div>
      )}
      {view === "home" &&
        (sessions.isPending ? (
          <PageState message="Loading sessions…" />
        ) : sessions.isError ? (
          <div>
            <PageState
              message="Sessions couldn't load. No empty history is assumed."
              error
            />
            <button onClick={() => void sessions.refetch()}>
              Retry sessions
            </button>
          </div>
        ) : (
          <WorkoutHome
            sessions={sessions.data}
            day={day}
            owner={owner}
            start={start}
            busy={busy}
            run={run}
            navigate={navigate}
          />
        ))}
      {view === "exercises" && (
        <>
          {search.session &&
            (detail.isError ? (
              <p role="alert">
                The selected workout couldn't load. Return Home or retry.
              </p>
            ) : detail.isPending ? (
              <p role="status">Loading selected workout…</p>
            ) : (
              <p className="workout-context">
                Adding to <strong>{detail.data.name}</strong> ·{" "}
                {dayLabel(detail.data.performed_on)}{" "}
                {detail.data.is_finished && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api.updateWorkout(detail.data.id, {
                          is_finished: false,
                        });
                      })
                    }
                  >
                    Reopen workout
                  </button>
                )}
              </p>
            ))}
          <WorkoutLibrary
            catalog={catalog.data}
            busy={busy}
            run={run}
            onSelect={selectExercise}
            selectingWorkout={!!search.session}
            existingExercises={detail.data?.exercises}
            onHistory={(exercise) =>
              navigate({ view: "history", date: day, exercise })
            }
            onOverview={(exercise) =>
              navigate({ view: "overview", date: day, exercise })
            }
            onProgress={(exercise) =>
              navigate({ view: "progress", date: day, exercise })
            }
            selectionDisabled={
              !!search.session &&
              (detail.isPending ||
                detail.isError ||
                detail.data?.is_finished === true)
            }
          />
        </>
      )}
      {view === "training" &&
        (detail.isPending ? (
          <PageState message="Loading training…" />
        ) : detail.isError ? (
          <div>
            <PageState
              message="Workout couldn't load. It may have been deleted."
              error
            />
            <button onClick={() => void detail.refetch()}>Retry workout</button>
          </div>
        ) : detail.data ? (
          <WorkoutTraining
            key={`${detail.data.id}:${search.exercise}`}
            onCompleted={() => restTimer.current?.completed()}
            autoAdvance={catalog.data.preferences?.auto_advance_groups ?? true}
            onAutoAdvance={(enabled) =>
              run(async () => {
                await api.saveWorkoutPreferences({
                  auto_advance_groups: enabled,
                });
              })
            }
            saveEquipment={async (data) => {
              await mutation.mutateAsync(async () => {
                await api.saveWorkoutPreferences(data);
              });
            }}
            savePlanned={async (itemId, data) => {
              await mutation.mutateAsync(async () => {
                await api.saveWorkoutSet(itemId, undefined, data);
              });
            }}
            workout={detail.data}
            itemId={search.exercise || ""}
            catalog={catalog.data}
            owner={owner}
            busy={busy}
            run={run}
            navigate={navigate}
          />
        ) : null)}
      {view === "history" && (
        <WorkoutHistory
          key={`${day}:${search.exercise || ""}`}
          day={day}
          owner={owner}
          exercise={search.exercise}
          busy={busy}
          run={run}
          navigate={navigate}
        />
      )}
      {view === "routines" && (
        <WorkoutRoutines
          owner={owner}
          day={day}
          busy={busy}
          run={run}
          navigate={navigate}
        />
      )}
      {view === "calendar" && (
        <WorkoutCalendar
          owner={owner}
          date={day}
          busy={busy}
          navigate={navigate}
        />
      )}
      {view === "overview" && (
        <WorkoutOverview
          key={search.exercise ?? "choose"}
          owner={owner}
          date={day}
          exerciseId={search.exercise}
          catalog={catalog.data}
          navigate={navigate}
        />
      )}
      {view === "progress" && (
        <WorkoutProgress
          owner={owner}
          date={day}
          exerciseId={search.exercise}
          catalog={catalog.data}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function WorkoutHome({
  sessions,
  day,
  owner,
  start,
  busy,
  run,
  navigate,
}: {
  sessions: api.Workout[];
  day: string;
  owner: string;
  start: () => void;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  return (
    <div className="workout-layout">
      <div className="workout-stack">
        <div className="workout-actions">
          <button className="primary-button" disabled={busy} onClick={start}>
            Start new workout
          </button>
          <button disabled={busy} onClick={() => setCopyOpen(true)}>
            Copy previous workout
          </button>
        </div>
        {copyOpen && (
          <CopyWorkoutPicker
            owner={owner}
            destination={day}
            busy={busy}
            run={run}
            navigate={navigate}
            onClose={() => setCopyOpen(false)}
          />
        )}
        {sessions.length ? (
          sessions.map((w) => (
            <SessionCard
              key={w.id}
              workout={w}
              busy={busy}
              run={run}
              navigate={navigate}
            />
          ))
        ) : (
          <section className="workout-card workout-empty">
            <span aria-hidden="true" className="workout-empty-icon">
              ＋
            </span>
            <h2>No workout on this day</h2>
            <p>
              Start a session and choose your first exercise, or copy a previous
              workout.
            </p>
          </section>
        )}
      </div>
      <aside className="workout-stack">
        <section className="workout-card">
          <h2>{dayLabel(day)}</h2>
          <p>
            <strong className="workout-stat">
              {sessions.reduce((n, w) => n + w.completed_set_count, 0)}
            </strong>{" "}
            completed sets
          </p>
          <p>
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
          </p>
        </section>
        <WorkoutWeek owner={owner} navigate={navigate} busy={busy} />
      </aside>
    </div>
  );
}
function WorkoutWeek({
  owner,
  navigate,
  busy,
}: {
  owner: string;
  navigate: NavigateWorkout;
  busy: boolean;
}) {
  const today = localDay(new Date());
  const from = shiftDay(today, -6);
  const query = useQuery({
    queryKey: ["workouts", owner, "week", today],
    queryFn: () => api.getWorkoutRange(from, today),
  });
  return (
    <section className="workout-card">
      <h2>Last 7 days</h2>
      {query.isError ? (
        <p role="status">History couldn't load.</p>
      ) : query.isPending ? (
        <p role="status">Loading history…</p>
      ) : (
        <div className="workout-week">
          {Array.from({ length: 7 }, (_, i) => {
            const day = shiftDay(today, i - 6);
            const count = query.data.filter(
              (w) => w.performed_on === day && w.completed_set_count > 0,
            ).length;
            return (
              <button
                key={day}
                disabled={busy}
                aria-label={`${dayLabel(day)}, ${count} sessions`}
                aria-current={day === today ? "date" : undefined}
                onClick={() => navigate({ view: "home", date: day })}
              >
                <span>
                  {new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
                    weekday: "short",
                  })}
                </span>
                <b>{Number(day.slice(-2))}</b>
                <span>{count}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="workout-note">
        Sessions with completed sets, ending today.
      </p>
    </section>
  );
}
function SessionCard({
  workout: w,
  busy,
  run,
  navigate,
}: {
  workout: api.Workout;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
}) {
  const [dialog, setDialog] = useState<
    "edit" | "delete" | "copy" | "routine" | "export" | null
  >(null);
  return (
    <section className="workout-card">
      <div className="workout-card-heading">
        <h2>{w.name}</h2>
        <span className="workout-badge">
          {w.is_finished ? "Finished" : "In progress"}
        </span>
      </div>
      <p>
        {w.completed_set_count} completed{" "}
        {w.completed_set_count === 1 ? "set" : "sets"} · {w.exercises.length}{" "}
        {w.exercises.length === 1 ? "exercise" : "exercises"}
      </p>
      <div className="workout-stack">
        {w.exercises.map((item, index) => (
          <div
            key={item.id}
            className={`workout-inset${item.group_name ? " workout-group-mark" : ""}`}
            style={
              item.group_name
                ? { borderInlineStartColor: item.group_colour ?? "#007f68" }
                : undefined
            }
          >
            <button
              className="workout-text-button"
              disabled={busy}
              onClick={() =>
                navigate({
                  view: "training",
                  date: w.performed_on,
                  session: w.id,
                  exercise: item.id,
                })
              }
            >
              {item.exercise_name} →
            </button>
            {item.group_name && (
              <span className="workout-badge">{item.group_name}</span>
            )}
            {item.sets.map((s, i) => (
              <div className="workout-summary-row" key={s.id}>
                <span>
                  {i + 1}. {setLabel(item, s)}
                </span>
                <span
                  className={`workout-badge ${s.is_completed ? "" : "muted"}`}
                >
                  {s.is_completed ? "Completed" : "Planned"}
                </span>
              </div>
            ))}
            {!item.sets.length && <p>No sets yet</p>}
            <WorkoutOrderControls
              kind="session-exercises"
              id={item.id}
              label={`exercise ${index + 1} (${item.exercise_name})`}
              index={index}
              count={w.exercises.length}
              disabled={busy || w.is_finished}
              run={run}
            />
            <RemoveWorkoutExercise
              item={item}
              finished={w.is_finished}
              busy={busy}
              run={run}
            />
          </div>
        ))}
      </div>
      {w.notes && <p className="workout-note">{w.notes}</p>}
      <WorkoutTiming workout={w} busy={busy} run={run} />
      <div className="workout-actions">
        <button
          disabled={busy}
          onClick={() =>
            navigate({ view: "exercises", date: w.performed_on, session: w.id })
          }
        >
          Add exercise
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api.updateWorkout(w.id, { is_finished: !w.is_finished });
            })
          }
        >
          {w.is_finished ? "Reopen workout" : "Finish workout"}
        </button>
        <button disabled={busy} onClick={() => setDialog("edit")}>
          Session details
        </button>
        <button disabled={busy} onClick={() => setDialog("copy")}>
          Copy workout
        </button>
        <button disabled={busy} onClick={() => setDialog("export")}>
          Export workout
        </button>
        <button
          disabled={busy || !w.exercises.length}
          onClick={() => setDialog("routine")}
        >
          Save as routine day
        </button>
        <button
          className="workout-danger"
          disabled={busy}
          onClick={() => setDialog("delete")}
        >
          Delete workout
        </button>
      </div>
      {dialog === "routine" && (
        <SaveRoutineDayDialog
          workout={w}
          busy={busy}
          run={run}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "copy" && (
        <CopyWorkoutDialog
          source={w}
          destination={localDay(new Date())}
          busy={busy}
          run={run}
          navigate={navigate}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "export" && (
        <WorkoutExportDialog workout={w} onClose={() => setDialog(null)} />
      )}
      {(dialog === "edit" || dialog === "delete") && (
        <Modal
          labelledBy={`session-dialog-${w.id}`}
          busy={busy}
          onClose={() => setDialog(null)}
        >
          <h2 id={`session-dialog-${w.id}`}>
            {dialog === "delete" ? "Delete workout?" : "Session details"}
          </h2>
          {dialog === "delete" ? (
            <>
              <p>
                This permanently deletes this session and its sets. Your
                exercise library is kept.
              </p>
              <button
                className="workout-danger"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api.deleteWorkoutItem("sessions", w.id);
                    setDialog(null);
                  })
                }
              >
                Confirm deletion
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(async () => {
                  const saved = await api.updateWorkout(w.id, {
                    name: String(fd.get("name")).trim(),
                    notes: String(fd.get("notes")),
                    performed_on: String(fd.get("date")),
                  });
                  setDialog(null);
                  navigate({ view: "home", date: saved.performed_on });
                });
              }}
            >
              <label>
                Session date
                <input
                  name="date"
                  type="date"
                  defaultValue={w.performed_on}
                  required
                  disabled={busy}
                />
              </label>
              <>
                <label>
                  Session name
                  <input
                    name="name"
                    defaultValue={w.name}
                    required
                    maxLength={120}
                    disabled={busy}
                  />
                </label>
                <label>
                  Session notes
                  <textarea
                    name="notes"
                    defaultValue={w.notes}
                    maxLength={2000}
                    disabled={busy}
                  />
                </label>
              </>
              <button className="primary-button" disabled={busy}>
                Save session
              </button>
            </form>
          )}
          <button disabled={busy} onClick={() => setDialog(null)}>
            Cancel
          </button>
        </Modal>
      )}
    </section>
  );
}
function WorkoutHistory({
  day,
  owner,
  exercise,
  busy,
  run,
  navigate,
}: {
  day: string;
  owner: string;
  exercise?: string;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
}) {
  const [offset, setOffset] = useState(0);
  const [copy, setCopy] = useState<api.Workout | null>(null);
  const query = useQuery({
    queryKey: ["workouts", owner, "history", day, exercise, offset],
    queryFn: () =>
      api.getWorkoutPage(shiftDay(day, -89), day, offset, exercise),
  });
  if (query.isPending) return <PageState message="Loading workout history…" />;
  if (query.isError)
    return (
      <div>
        <PageState message="History couldn't load. Please retry." error />
        <button onClick={() => void query.refetch()}>Retry history</button>
      </div>
    );
  return (
    <div className="workout-stack">
      <p className="workout-note">
        {dayLabel(shiftDay(day, -89))} – {dayLabel(day)} · {query.data.count}{" "}
        sessions
      </p>
      {query.data.results.length ? (
        query.data.results.map((w) => (
          <section className="workout-card" key={w.id}>
            <div className="workout-card-heading">
              <div>
                <h2>{w.name}</h2>
                <p>
                  {dayLabel(w.performed_on)} · {w.completed_set_count} completed
                  sets
                </p>
              </div>
              <div className="workout-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    navigate({ view: "home", date: w.performed_on })
                  }
                >
                  View workout
                </button>
                <button disabled={busy} onClick={() => setCopy(w)}>
                  Copy workout
                </button>
              </div>
            </div>
          </section>
        ))
      ) : (
        <section className="workout-card">
          <h2>No sessions in this range</h2>
          <p>Choose another ending date to explore older history.</p>
        </section>
      )}
      <div className="workout-actions">
        <button
          disabled={busy || !query.data.previous}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous page
        </button>
        <button
          disabled={busy || !query.data.next}
          onClick={() => setOffset(offset + 100)}
        >
          Next page
        </button>
      </div>
      {copy && (
        <CopyWorkoutDialog
          source={copy}
          destination={day}
          busy={busy}
          run={run}
          navigate={navigate}
          onClose={() => setCopy(null)}
        />
      )}
    </div>
  );
}
