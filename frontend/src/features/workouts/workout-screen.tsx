import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { PageHeader } from "../../components/page-header";
import { PageState } from "../../components/page-state";
import { Modal } from "../../components/modal";
import { WorkoutExportDialog } from "./workout-export-dialog";
import { WorkoutExerciseLog } from "./workout-exercise-log";
import { WorkoutTiming } from "./workout-timing";
import { useMeQuery } from "../auth/use-me-query";
import * as api from "./workout-api";
import {
  dayLabel,
  localDay,
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
  const [editor, setEditor] = useState<{
    session: string;
    exercise: string;
  } | null>(null);
  const editingExercise =
    view === "training" && editor && editor.session === search.session
      ? editor.exercise
      : null;
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
    if (next.view !== "training") setEditor(null);
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
      setEditor({ session: session.id, exercise: item.id });
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
  const dateControls = (
    <div className="workout-date-controls date-navigation">
      <button
        aria-label="Previous day"
        disabled={busy}
        onClick={() => selectDate(shiftDay(day, -1))}
      >
        ←
      </button>
      <label>
        <span className={view === "home" ? "visually-hidden" : undefined}>
          Tracking date
        </span>
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
      <button disabled={busy} onClick={() => selectDate(localDay(new Date()))}>
        Today
      </button>
    </div>
  );
  return (
    <div className={`workout-screen${view === "home" ? " workout-home" : ""}`}>
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
      <div hidden={!editingExercise}>
        <RestTimer
          dialogMode
          ref={restTimer}
          seconds={
            catalog.data.exercises.find(
              (e) =>
                e.id ===
                detail.data?.exercises.find(
                  (i) => i.id === (editingExercise ?? search.exercise),
                )?.exercise_id,
            )?.rest_seconds ?? 90
          }
          context={
            detail.data?.exercises.find(
              (item) => item.id === (editingExercise ?? search.exercise),
            )?.exercise_id ?? ""
          }
          autoStart={catalog.data.preferences?.auto_start_rest ?? false}
          onAutoStartChange={(enabled) =>
            run(async () => {
              await api.saveWorkoutPreferences({ auto_start_rest: enabled });
            })
          }
          disabled={busy}
        />
      </div>
      {view !== "training" &&
        view !== "home" &&
        !(view === "overview" && search.exercise) && (
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
                ? "Review sessions, progress, statistics and goals for one exercise."
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
      {view === "home" ? (
        !sessions.isSuccess && (
          <section className="workout-home-context" aria-label="Daily sessions">
            {dateControls}
          </section>
        )
      ) : view === "overview" && search.exercise ? (
        <details className="workout-analysis-date">
          <summary>Analysis through {dayLabel(day)}</summary>
          {dateControls}
        </details>
      ) : (
        view !== "training" && dateControls
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
            dateControls={dateControls}
            day={day}
            owner={owner}
            start={start}
            busy={busy}
            run={run}
            navigate={navigate}
            openExercise={(next) => {
              setEditor({ session: next.session!, exercise: next.exercise! });
              navigate(next);
            }}
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
          !editingExercise ? (
            <div className="workout-home">
              <SessionCard
                workout={detail.data}
                busy={busy}
                run={run}
                navigate={navigate}
                openExercise={(next) =>
                  setEditor({
                    session: detail.data.id,
                    exercise: next.exercise!,
                  })
                }
              />
            </div>
          ) : (
            <>
              <button
                className="workout-back"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Back to workout
              </button>
              <WorkoutTraining
                onOpenRest={() => restTimer.current?.open()}
                key={`${detail.data.id}:${editingExercise}`}
                onCompleted={() => restTimer.current?.completed()}
                autoAdvance={
                  catalog.data.preferences?.auto_advance_groups ?? true
                }
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
                itemId={editingExercise}
                catalog={catalog.data}
                owner={owner}
                busy={busy}
                run={run}
                navigate={(next) => {
                  if (next.view === "training" && next.exercise)
                    setEditor({
                      session: next.session!,
                      exercise: next.exercise,
                    });
                  navigate(next);
                }}
              />
            </>
          )
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
          categories={catalog.data.categories}
          owner={owner}
          date={day}
          busy={busy}
          navigate={navigate}
        />
      )}
      {view === "overview" && (
        <WorkoutOverview
          key={`${search.exercise ?? "choose"}:${search.section ?? "stats"}:${day}`}
          initialSection={search.section}
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
  openExercise,
  dateControls,
  sessions,
  day,
  owner,
  start,
  busy,
  run,
  navigate,
}: {
  openExercise: NavigateWorkout;
  dateControls: ReactNode;
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
    <div className="workout-stack">
      <section
        className={`workout-home-context${sessions.length ? "" : " is-empty"}`}
        aria-label="Daily sessions"
      >
        {dateControls}
        {sessions.length > 0 && (
          <details className="workout-home-menu workout-home-day-menu">
            <summary>Day actions</summary>
            <div className="workout-home-menu-items">
              <button
                aria-label="Start new workout"
                disabled={busy}
                onClick={start}
              >
                + New workout
              </button>
              <button
                aria-label="Copy previous workout"
                disabled={busy}
                onClick={() => setCopyOpen(true)}
              >
                Copy previous
              </button>
            </div>
          </details>
        )}
      </section>
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
            openExercise={openExercise}
            busy={busy}
            run={run}
            navigate={navigate}
          />
        ))
      ) : (
        <section
          className="workout-home-empty"
          aria-labelledby="workout-empty-title"
        >
          <h2 id="workout-empty-title">No workout on this day</h2>
          <button
            className="workout-home-start"
            aria-label="Start new workout"
            disabled={busy}
            onClick={start}
          >
            <span aria-hidden="true">＋</span>
            Start new workout
          </button>
          <button
            className="workout-home-copy"
            aria-label="Copy previous workout"
            disabled={busy}
            onClick={() => setCopyOpen(true)}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="8" y="8" width="12" height="13" rx="2" />
              <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
            </svg>
            Copy previous workout
          </button>
        </section>
      )}
    </div>
  );
}
function SessionCard({
  openExercise,
  workout: w,
  busy,
  run,
  navigate,
}: {
  workout: api.Workout;
  openExercise?: NavigateWorkout;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
}) {
  const [moveDate, setMoveDate] = useState(w.performed_on);
  const [moveError, setMoveError] = useState("");
  const [commentError, setCommentError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [dialog, setDialog] = useState<
    | "edit"
    | "comment"
    | "delete"
    | "move"
    | "routine"
    | "export"
    | "time"
    | null
  >(null);
  return (
    <section className="workout-card workout-home-session">
      <div className="workout-card-heading">
        <h2>{w.name}</h2>
        <span
          className={`visually-hidden workout-badge workout-status workout-status--${w.is_finished ? "finished" : "in-progress"}`}
        >
          {w.is_finished ? "Finished" : "In progress"}
        </span>
        <button
          className="workout-home-add"
          aria-label="Add exercise"
          disabled={busy}
          onClick={() =>
            navigate({
              view: "exercises",
              date: w.performed_on,
              session: w.id,
            })
          }
        >
          <span aria-hidden="true">＋</span>
        </button>
        <details
          className="workout-home-menu"
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("button")
            ) {
              event.currentTarget.querySelector("summary")?.focus();
              event.currentTarget.open = false;
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary aria-label={`Actions for ${w.name}`}>
            <span>More actions ···</span>
          </summary>
          <div className="workout-home-menu-items">
            <button disabled={busy} onClick={() => setDialog("edit")}>
              Edit workout
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setCommentError("");
                setDialog("comment");
              }}
            >
              Comment workout
            </button>
            <button disabled={busy} onClick={() => setDialog("time")}>
              Time workout
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setMoveDate(w.performed_on);
                setMoveError("");
                setDialog("move");
              }}
            >
              Move workout
            </button>
            <button disabled={busy} onClick={() => setDialog("export")}>
              Export workout
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.updateWorkout(w.id, {
                    is_finished: !w.is_finished,
                  });
                })
              }
            >
              {w.is_finished ? "Reopen workout" : "Finish workout"}
            </button>
            <button disabled={busy} onClick={() => setManaging(true)}>
              Manage workout
            </button>
          </div>
        </details>
      </div>
      {dialog === "comment" && (
        <Modal
          labelledBy={`workout-comment-${w.id}`}
          busy={busy}
          onClose={() => setDialog(null)}
        >
          <h2 id={`workout-comment-${w.id}`}>Comment workout</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const notes = String(
                new FormData(event.currentTarget).get("notes"),
              );
              setCommentError("");
              run(async () => {
                try {
                  await api.updateWorkout(w.id, { notes });
                  setDialog(null);
                } catch (reason) {
                  setCommentError(
                    reason instanceof Error
                      ? reason.message
                      : "Comment couldn't be saved. Please retry.",
                  );
                }
              });
            }}
          >
            <label>
              Workout comment
              <textarea
                name="notes"
                defaultValue={w.notes}
                rows={5}
                maxLength={2000}
                disabled={busy}
              />
            </label>
            {commentError && <p role="alert">{commentError}</p>}
            <div className="workout-actions">
              <button className="primary-button" disabled={busy}>
                Save comment
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "time" && (
        <Modal
          labelledBy={`workout-time-${w.id}`}
          className="workout-time-modal"
          busy={busy}
          onClose={() => setDialog(null)}
        >
          <h2 id={`workout-time-${w.id}`}>Time workout</h2>
          <WorkoutTiming workout={w} busy={busy} run={run} />
          <button disabled={busy} onClick={() => setDialog(null)}>
            Close
          </button>
        </Modal>
      )}
      <WorkoutExerciseLog
        workout={w}
        busy={busy}
        run={run}
        selecting={selecting}
        onDone={() => setSelecting(false)}
        onOpen={(id) =>
          (openExercise ?? navigate)({
            view: "training",
            date: w.performed_on,
            session: w.id,
            exercise: id,
          })
        }
      />
      {managing && (
        <Modal
          labelledBy={`workout-manage-${w.id}`}
          busy={busy}
          onClose={() => setManaging(false)}
        >
          <h2 id={`workout-manage-${w.id}`}>Manage workout</h2>
          <button
            disabled={busy || w.is_finished || !w.exercises.length}
            onClick={() => {
              setManaging(false);
              setSelecting(true);
            }}
          >
            Select exercises
          </button>
          {w.exercises.map((item, index) => (
            <section className="workout-inset" key={item.id}>
              <h3>{item.exercise_name}</h3>
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
            </section>
          ))}
          {!w.exercises.length && <p>No exercises in this workout yet.</p>}
          {w.is_finished && (
            <p>Reopen this workout to reorder or remove exercises.</p>
          )}
          <div className="workout-actions">
            <button
              disabled={busy || !w.exercises.length}
              onClick={() => {
                setManaging(false);
                setDialog("routine");
              }}
            >
              Save as routine day
            </button>
            <button
              className="workout-danger"
              disabled={busy}
              onClick={() => {
                setManaging(false);
                setDialog("delete");
              }}
            >
              Delete workout
            </button>
            <button disabled={busy} onClick={() => setManaging(false)}>
              Done managing
            </button>
          </div>
        </Modal>
      )}
      {dialog === "routine" && (
        <SaveRoutineDayDialog
          workout={w}
          busy={busy}
          run={run}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "move" && (
        <Modal
          labelledBy={`workout-move-${w.id}`}
          busy={busy}
          onClose={() => setDialog(null)}
        >
          <h2 id={`workout-move-${w.id}`}>Move workout</h2>
          <p>
            Move this workout to another date. All exercises, sets and comments
            stay with it.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!moveDate || moveDate === w.performed_on || busy) return;
              setMoveError("");
              run(async () => {
                try {
                  const saved = await api.updateWorkout(w.id, {
                    performed_on: moveDate,
                  });
                  setDialog(null);
                  navigate({ view: "home", date: saved.performed_on });
                } catch (reason) {
                  setMoveError(
                    reason instanceof Error
                      ? reason.message
                      : "Workout couldn't be moved. Please retry.",
                  );
                }
              });
            }}
          >
            <label>
              Move to date
              <input
                type="date"
                required
                value={moveDate}
                disabled={busy}
                onChange={(event) => setMoveDate(event.target.value)}
              />
            </label>
            {moveError && <p role="alert">{moveError}</p>}
            <div className="workout-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={busy || !moveDate || moveDate === w.performed_on}
              >
                Move
              </button>
            </div>
          </form>
        </Modal>
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
            {dialog === "delete" ? "Delete workout?" : "Edit workout"}
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
