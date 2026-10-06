import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { PageHeader } from "../../components/page-header";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import { WorkoutTools } from "./workout-tools";
import { WorkoutTiming } from "./workout-timing";
import { WorkoutGroups } from "./workout-groups";
import { RemoveWorkoutExercise } from "./remove-workout-exercise";
import { WorkoutOrderControls } from "./workout-order-controls";
import { BulkSetDialog } from "./bulk-set-dialog";
import {
  dayLabel,
  setLabel,
  shiftDay,
  nextGroupedExercise,
  type NavigateWorkout,
  type RunAction,
} from "./workout-navigation";

export function WorkoutTraining({
  workout,
  itemId,
  catalog,
  owner,
  navigate,
  busy,
  run,
  onCompleted,
  autoAdvance,
  onAutoAdvance,
  savePlanned,
  saveEquipment,
}: {
  workout: api.Workout;
  itemId: string;
  catalog: api.WorkoutCatalog;
  owner: string;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
  onCompleted: () => void;
  autoAdvance: boolean;
  onAutoAdvance: (enabled: boolean) => void;
  savePlanned: (itemId: string, data: api.SetInput) => Promise<void>;
  saveEquipment?: (data: api.WorkoutPreferences) => Promise<void>;
}) {
  const client = useQueryClient();
  const item = workout.exercises.find((i) => i.id === itemId);
  const [tab, setTab] = useState<"track" | "history">("track");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "notes" | "delete-set" | "manage" | "groups" | "bulk" | null
  >(null);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<api.WorkoutSet | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const history = useQuery({
    queryKey: [
      "workouts",
      owner,
      "exercise-history",
      item?.exercise_id,
      workout.performed_on,
    ],
    queryFn: () =>
      api.getWorkoutPage(
        shiftDay(workout.performed_on, -89),
        workout.performed_on,
        0,
        item!.exercise_id,
      ),
    enabled: !!item,
  });
  if (!item)
    return (
      <section className="workout-card">
        <h2>This exercise is no longer in this session.</h2>
        <button
          onClick={() => navigate({ view: "home", date: workout.performed_on })}
        >
          Return Home
        </button>
      </section>
    );
  const editing = item.sets.find((s) => s.id === editingId);
  const library = catalog.exercises.find((e) => e.id === item.exercise_id);
  const advance = () => {
    onCompleted();
    const next = nextGroupedExercise(workout.exercises, item.id);
    if (autoAdvance && next)
      navigate({
        view: "training",
        date: workout.performed_on,
        session: workout.id,
        exercise: next.id,
      });
  };
  const disabled = busy || workout.is_finished;
  const source = editing || draft || item.sets.at(-1);
  const previous = history.data?.results
    .filter((w) => w.id !== workout.id)
    .flatMap((w) => w.exercises)
    .find(
      (i) =>
        i.exercise_id === item.exercise_id &&
        i.tracking_type === item.tracking_type &&
        i.weight_unit === item.weight_unit &&
        i.distance_unit === item.distance_unit,
    )
    ?.sets.find((s) => s.is_completed);
  function input(name: string, value: string) {
    const field = form.current?.elements.namedItem(name);
    if (field instanceof HTMLInputElement) field.value = value;
  }
  const fields: {
    name: "weight" | "reps" | "distance" | "duration_seconds";
    label: string;
    min: number;
    step: string;
    required: boolean;
  }[] =
    item.tracking_type === "duration"
      ? [
          {
            name: "duration_seconds",
            label: "Duration (seconds)",
            min: 1,
            step: "1",
            required: true,
          },
        ]
      : item.tracking_type === "cardio"
        ? [
            {
              name: "distance",
              label: `Distance (${item.distance_unit})`,
              min: 0.001,
              step: "0.001",
              required: true,
            },
            {
              name: "duration_seconds",
              label: "Duration (seconds)",
              min: 1,
              step: "1",
              required: true,
            },
          ]
        : [
            {
              name: "weight",
              label: `Weight (${item.weight_unit})`,
              min: 0,
              step: "0.001",
              required: item.tracking_type === "strength",
            },
            { name: "reps", label: "Reps", min: 1, step: "1", required: true },
          ];
  return (
    <>
      <PageHeader
        title={item.exercise_name}
        eyebrow={item.category_name}
        description={`${dayLabel(workout.performed_on)} · ${workout.name}`}
      />
      <details className="workout-card workout-training-options">
        <summary>Workout options</summary>
        <WorkoutTiming workout={workout} busy={busy} run={run} />
        {item.group_name && (
          <div className="workout-actions">
            <span className="workout-badge">{item.group_name}</span>
            <label className="workout-check">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => onAutoAdvance(e.target.checked)}
              />
              Advance within group after completion
            </label>
          </div>
        )}
        <div className="workout-actions">
          <button
            disabled={busy}
            onClick={() =>
              navigate({ view: "home", date: workout.performed_on })
            }
          >
            Workout overview
          </button>
          <button
            disabled={busy || !library}
            onClick={() => setDialog("notes")}
          >
            Exercise notes
          </button>
          <button disabled={disabled} onClick={() => setDialog("manage")}>
            Manage exercise
          </button>
          <button
            disabled={busy}
            onClick={() =>
              navigate({
                view: "progress",
                date: workout.performed_on,
                exercise: item.exercise_id,
              })
            }
          >
            Exercise progress
          </button>
          <button
            disabled={busy}
            onClick={() =>
              navigate({
                view: "overview",
                date: workout.performed_on,
                exercise: item.exercise_id,
              })
            }
          >
            Exercise overview
          </button>
        </div>
      </details>
      {workout.is_finished && (
        <div className="workout-context">
          This workout is finished. Reopen it to edit sets.{" "}
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.updateWorkout(workout.id, { is_finished: false });
              })
            }
          >
            Reopen workout
          </button>
        </div>
      )}
      <div className="workout-training-layout">
        <aside className="workout-card workout-training-sidebar">
          <h2>This workout</h2>
          <div className="workout-stack">
            {workout.exercises.map((i, index) => (
              <div key={i.id} className="workout-sidebar-exercise">
                <button
                  disabled={busy}
                  aria-pressed={i.id === item.id}
                  className={i.group_name ? "workout-group-mark" : undefined}
                  style={
                    i.group_name
                      ? { borderInlineStartColor: i.group_colour ?? "#007f68" }
                      : undefined
                  }
                  onClick={() =>
                    navigate({
                      view: "training",
                      date: workout.performed_on,
                      session: workout.id,
                      exercise: i.id,
                    })
                  }
                >
                  <span>
                    {i.exercise_name}
                    {i.group_name && (
                      <small style={{ display: "block" }}>{i.group_name}</small>
                    )}
                    <small style={{ display: "block" }}>
                      {i.sets.filter((s) => s.is_completed).length}/
                      {i.sets.length} sets completed
                    </small>
                  </span>
                </button>
                <WorkoutOrderControls
                  kind="session-exercises"
                  id={i.id}
                  label={`exercise ${index + 1} (${i.exercise_name})`}
                  index={index}
                  count={workout.exercises.length}
                  disabled={disabled}
                  run={run}
                />
              </div>
            ))}
          </div>
          <button
            disabled={disabled}
            style={{ marginTop: 12 }}
            onClick={() =>
              navigate({
                view: "exercises",
                date: workout.performed_on,
                session: workout.id,
              })
            }
          >
            Add exercise
          </button>
          <button disabled={disabled} onClick={() => setDialog("groups")}>
            {item.group_name ? "Edit group" : "Add to group"}
          </button>
          <RemoveWorkoutExercise
            item={item}
            finished={workout.is_finished}
            busy={busy}
            run={run}
            onRemoved={() =>
              navigate({ view: "home", date: workout.performed_on })
            }
          />
        </aside>
        <section className="workout-card workout-training-main">
          <WorkoutTools
            item={item}
            busy={disabled}
            onAdd={(data) => savePlanned(item.id, data)}
            preferences={catalog.preferences}
            onSaveEquipment={saveEquipment}
          />
          <div className="workout-subtabs">
            <button
              disabled={busy}
              aria-pressed={tab === "track"}
              onClick={() => setTab("track")}
            >
              Track
            </button>
            <button
              disabled={busy}
              aria-pressed={tab === "history"}
              onClick={() => setTab("history")}
            >
              Exercise history
            </button>
          </div>
          {tab === "track" ? (
            <>
              <div className="workout-card-heading">
                <h2>{editing ? "Edit set" : "Record a set"}</h2>
                {previous && !editing && (
                  <button
                    disabled={disabled}
                    onClick={() => {
                      fields.forEach((f) =>
                        input(f.name, String(previous[f.name] ?? "")),
                      );
                    }}
                  >
                    Use previous set
                  </button>
                )}
              </div>
              <form
                noValidate
                key={`${editing?.id || "new"}:${version}`}
                ref={form}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const submitter = (e.nativeEvent as SubmitEvent).submitter;
                  const completed = editing
                    ? editing.is_completed
                    : !(
                        submitter instanceof HTMLButtonElement &&
                        submitter.value === "planned"
                      );
                  if (completed && !e.currentTarget.reportValidity()) return;
                  const data: api.SetInput = {
                    comment: String(fd.get("comment")),
                    is_completed: completed,
                  };
                  for (const f of fields) {
                    const value = String(fd.get(f.name) || "");
                    if (f.name === "weight" || f.name === "distance")
                      data[f.name] = value || null;
                    else data[f.name] = value ? Number(value) : null;
                  }
                  if (editing) data.display_order = Number(fd.get("order"));
                  run(async () => {
                    const saved = await api.saveWorkoutSet(
                      item.id,
                      editing?.id,
                      data,
                    );
                    setDraft(saved);
                    if (completed && (!editing || !editing.is_completed))
                      advance();
                    setEditingId(null);
                    setVersion((v) => v + 1);
                  });
                }}
              >
                <div className="workout-fields">
                  {fields.map((f) => (
                    <label key={f.name}>
                      {f.label}
                      <input
                        name={f.name}
                        type="number"
                        min={f.min}
                        max={
                          f.name === "reps"
                            ? 100000
                            : f.name === "duration_seconds"
                              ? 2147483647
                              : 9999999.999
                        }
                        step={f.step}
                        required={f.required}
                        defaultValue={source?.[f.name] ?? ""}
                        disabled={disabled}
                      />
                    </label>
                  ))}
                </div>
                {editing && (
                  <label>
                    Set order
                    <input
                      name="order"
                      type="number"
                      min="0"
                      max="2147483647"
                      step="1"
                      defaultValue={editing.display_order}
                      required
                      disabled={disabled}
                    />
                  </label>
                )}
                <div className="workout-actions" style={{ marginTop: 16 }}>
                  <button
                    className="primary-button"
                    disabled={disabled}
                    formNoValidate={!!editing && !editing.is_completed}
                  >
                    {editing ? "Update set" : "Save completed set"}
                  </button>
                  {editing ? (
                    <>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel edit
                      </button>
                      <button
                        type="button"
                        className="workout-danger"
                        disabled={disabled}
                        onClick={() => setDialog("delete-set")}
                      >
                        Delete set
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={disabled}
                      type="submit"
                      name="completion"
                      value="planned"
                      formNoValidate
                    >
                      Add planned set
                    </button>
                  )}
                </div>
                <label>
                  Set comment
                  <input
                    name="comment"
                    maxLength={2000}
                    defaultValue={editing?.comment || ""}
                    disabled={disabled}
                    placeholder="Optional: effort, form, assistance…"
                  />
                </label>
              </form>
              <div className="workout-set-list">
                <div className="workout-card-heading">
                  <h2>Sets</h2>
                  <small>
                    {item.sets.filter((s) => s.is_completed).length} of{" "}
                    {item.sets.length} completed
                  </small>
                </div>
                {item.sets.length ? (
                  item.sets.map((s, n) => (
                    <div className="workout-set-row" key={s.id}>
                      <strong>{n + 1}</strong>
                      <div className="workout-set-values">
                        <span>{setLabel(item, s)}</span>
                        {s.comment && <small>{s.comment}</small>}
                        <span
                          className={`workout-badge ${s.is_completed ? "" : "muted"}`}
                        >
                          {s.is_completed ? "Completed" : "Planned"}
                        </span>
                      </div>
                      <button
                        disabled={disabled}
                        aria-label={`Edit set ${n + 1}`}
                        onClick={() => setEditingId(s.id)}
                      >
                        Edit
                      </button>
                      <input
                        type="checkbox"
                        aria-label={`Set ${n + 1} completed`}
                        checked={s.is_completed}
                        disabled={disabled}
                        onChange={(e) => {
                          const completed = e.target.checked;
                          run(async () => {
                            await api.saveWorkoutSet(item.id, s.id, {
                              is_completed: completed,
                            });
                            if (completed) advance();
                          });
                        }}
                      />
                      <WorkoutOrderControls
                        kind="sets"
                        id={s.id}
                        label={`set ${n + 1}`}
                        index={n}
                        count={item.sets.length}
                        disabled={disabled}
                        run={run}
                      />
                    </div>
                  ))
                ) : (
                  <p>No sets yet. Record the first when you're ready.</p>
                )}
                {item.sets.length > 0 && (
                  <button
                    disabled={disabled}
                    onClick={() => {
                      const s = item.sets.at(-1)!;
                      run(async () => {
                        await api.saveWorkoutSet(item.id, undefined, {
                          weight: s.weight,
                          reps: s.reps,
                          distance: s.distance,
                          duration_seconds: s.duration_seconds,
                          comment: "",
                          is_completed: true,
                        });
                        advance();
                      });
                    }}
                  >
                    Repeat last as completed
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2>Recorded sessions</h2>
              <p className="workout-note">
                Last 90 days ending {dayLabel(workout.performed_on)}. Each entry
                keeps its original units.
              </p>
              {history.isPending ? (
                <p role="status">Loading exercise history…</p>
              ) : history.isError ? (
                <div>
                  <p role="alert">Exercise history couldn't load.</p>
                  <button onClick={() => void history.refetch()}>
                    Retry exercise history
                  </button>
                </div>
              ) : (
                <>
                  <button disabled={busy} onClick={() => setDialog("bulk")}>
                    Edit multiple sets
                  </button>
                  {dialog === "bulk" && (
                    <BulkSetDialog
                      workouts={[
                        workout,
                        ...history.data.results.filter(
                          (w) => w.id !== workout.id,
                        ),
                      ]}
                      exerciseId={item.exercise_id}
                      busy={busy}
                      run={run}
                      onClose={() => setDialog(null)}
                      onRefresh={() => {
                        setDialog(null);
                        void client.invalidateQueries({
                          queryKey: ["workouts", owner],
                        });
                      }}
                    />
                  )}
                  {[
                    workout,
                    ...history.data.results.filter((w) => w.id !== workout.id),
                  ].map((w) => {
                    const matches = w.exercises.filter(
                      (i) => i.exercise_id === item.exercise_id,
                    );
                    const target =
                      matches.find((i) => i.sets.length > 0) ?? matches[0];
                    return (
                      <div className="workout-inset" key={w.id}>
                        <h3>
                          {dayLabel(w.performed_on)} · {w.name}
                        </h3>
                        {w.id === workout.id && (
                          <span className="workout-badge">Current session</span>
                        )}
                        {matches.map((i) => (
                          <div key={i.id}>
                            {i.sets.map((s) => (
                              <p key={s.id}>
                                {setLabel(i, s)} ·{" "}
                                {s.is_completed ? "Completed" : "Planned"}
                                {s.comment && ` · ${s.comment}`}
                              </p>
                            ))}
                          </div>
                        ))}
                        {!matches.some((i) => i.sets.length) && (
                          <p>No sets recorded for this exercise.</p>
                        )}
                        {w.id === workout.id ? (
                          <button
                            disabled={busy}
                            onClick={() => setTab("track")}
                          >
                            Back to Track
                          </button>
                        ) : (
                          target && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                navigate({
                                  view: "training",
                                  date: w.performed_on,
                                  session: w.id,
                                  exercise: target.id,
                                })
                              }
                            >
                              Open exercise
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                  {history.data.next && (
                    <button
                      onClick={() =>
                        navigate({
                          view: "history",
                          date: workout.performed_on,
                          exercise: item.exercise_id,
                        })
                      }
                    >
                      View full paginated history
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
      {dialog === "groups" && (
        <WorkoutGroups
          workout={workout}
          current={item}
          catalog={catalog}
          busy={busy}
          run={run}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && dialog !== "groups" && dialog !== "bulk" && (
        <Modal
          labelledBy="training-dialog"
          busy={busy}
          onClose={() => setDialog(null)}
        >
          <h2 id="training-dialog">
            {dialog === "notes"
              ? "Exercise notes"
              : dialog === "manage"
                ? "Manage workout exercise"
                : "Delete set?"}
          </h2>
          {dialog === "notes" && library && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(async () => {
                  await api.saveExercise(library.id, {
                    notes: String(fd.get("notes")),
                    weight_increment: String(fd.get("increment")),
                    rest_seconds: Number(fd.get("rest")),
                  });
                  setDialog(null);
                });
              }}
            >
              <label>
                Exercise notes
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={library.notes}
                  disabled={busy}
                />
              </label>
              <div className="workout-fields">
                <label>
                  Library weight increment ({library.weight_unit})
                  <input
                    name="increment"
                    type="number"
                    min="0.001"
                    max="9999.999"
                    step="0.001"
                    defaultValue={library.weight_increment}
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  Rest time (seconds)
                  <input
                    name="rest"
                    type="number"
                    min="0"
                    max="3600"
                    step="1"
                    defaultValue={library.rest_seconds}
                    required
                    disabled={busy}
                  />
                </label>
              </div>
              <p className="workout-note">
                These are library defaults. This session's saved units stay
                unchanged.
              </p>
              <button disabled={busy} className="primary-button">
                Save notes
              </button>
            </form>
          )}
          {dialog === "delete-set" && editing && (
            <>
              <p>This permanently removes the selected set and its comment.</p>
              <button
                disabled={busy}
                className="workout-danger"
                onClick={() =>
                  run(async () => {
                    await api.deleteWorkoutItem("sets", editing.id);
                    setEditingId(null);
                    setDialog(null);
                    setDraft(null);
                    setVersion((v) => v + 1);
                  })
                }
              >
                Confirm set deletion
              </button>
            </>
          )}
          {dialog === "manage" && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const order = Number(fd.get("order"));
                  run(async () => {
                    await api.reorderWorkoutExercise(item.id, order);
                    setDialog(null);
                  });
                }}
              >
                <label>
                  Exercise order
                  <input
                    name="order"
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    required
                    defaultValue={item.display_order}
                    disabled={busy}
                  />
                </label>
                <button disabled={busy}>Save order</button>
              </form>
              <p>
                This removes the exercise and all of its sets from this session
                only.
              </p>
              <button
                disabled={busy}
                className="workout-danger"
                onClick={() =>
                  run(async () => {
                    await api.deleteWorkoutItem("session-exercises", item.id);
                    setDialog(null);
                    navigate({ view: "home", date: workout.performed_on });
                  })
                }
              >
                Confirm exercise removal
              </button>
            </>
          )}
          <button disabled={busy} onClick={() => setDialog(null)}>
            Cancel
          </button>
        </Modal>
      )}
    </>
  );
}
