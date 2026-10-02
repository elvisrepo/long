import { useState } from "react";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { RunAction } from "./workout-navigation";

const labels: Record<api.TrackingType, string> = {
  strength: "Weight + reps",
  bodyweight: "Reps · optional load",
  duration: "Time",
  cardio: "Distance + time",
};
type Editor =
  | { kind: "category"; item?: api.ExerciseCategory }
  | { kind: "exercise"; item?: api.Exercise };
export function WorkoutLibrary({
  catalog,
  busy,
  run,
  onSelect,
  selectionDisabled,
  selectingWorkout,
  existingExercises = [],
  onHistory,
  onProgress,
}: {
  catalog: api.WorkoutCatalog;
  busy: boolean;
  run: RunAction;
  onSelect: (id: string) => void;
  selectionDisabled: boolean;
  selectingWorkout: boolean;
  existingExercises?: api.WorkoutExercise[];
  onHistory: (id: string) => void;
  onProgress: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [archives, setArchives] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [detail, setDetail] = useState<api.Exercise | null>(null);
  const categories = catalog.categories.filter((c) => archives || c.is_active);
  return (
    <>
      <div className="workout-toolbar">
        <label>
          Search exercises
          <input
            value={search}
            maxLength={120}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bench, squat, running…"
          />
        </label>
        <div className="workout-actions">
          <button
            disabled={busy}
            onClick={() => setEditor({ kind: "category" })}
          >
            New category
          </button>
          <button
            className="primary-button"
            disabled={busy || !catalog.categories.some((c) => c.is_active)}
            onClick={() => setEditor({ kind: "exercise" })}
          >
            New exercise
          </button>
        </div>
      </div>
      <div className="workout-filters">
        <button aria-pressed={!category} onClick={() => setCategory("")}>
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
        <label className="workout-check">
          <input
            type="checkbox"
            checked={archives}
            onChange={(e) => {
              setArchives(e.target.checked);
              setCategory("");
            }}
          />
          Show archived
        </label>
      </div>
      {!catalog.categories.length && (
        <section className="workout-card workout-empty">
          <h2>Set up your exercise library</h2>
          <p>Use editable starter exercises or create your own categories.</p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.initializeWorkoutCatalog();
              })
            }
          >
            Use starter exercises
          </button>
        </section>
      )}
      <div className="workout-library-grid">
        {categories
          .filter((c) => !category || c.id === category)
          .map((c) => {
            const exercises = catalog.exercises.filter(
              (e) =>
                e.category_id === c.id &&
                (archives || e.is_active) &&
                e.name.toLowerCase().includes(search.toLowerCase()),
            );
            return (
              <section className="workout-card" key={c.id}>
                <div className="workout-card-heading">
                  <h2>
                    {c.name}
                    {!c.is_active && <small> · Archived</small>}
                  </h2>
                  <button
                    disabled={busy}
                    aria-label={`Edit category ${c.name}`}
                    onClick={() => setEditor({ kind: "category", item: c })}
                  >
                    Edit
                  </button>
                </div>
                <div className="workout-stack">
                  {exercises.map((e) => (
                    <div className="workout-exercise-row" key={e.id}>
                      <button
                        className="workout-exercise-choice"
                        disabled={
                          busy ||
                          (selectingWorkout &&
                            (selectionDisabled || !c.is_active || !e.is_active))
                        }
                        aria-label={`${selectingWorkout ? (existingExercises.some((i) => i.exercise_id === e.id) ? "Open" : "Add") : "View"} ${e.name}`}
                        onClick={() =>
                          selectingWorkout ? onSelect(e.id) : setDetail(e)
                        }
                      >
                        <span>
                          {e.name}
                          <small>
                            {labels[e.tracking_type]}
                            {!e.is_active ? " · Archived" : ""}
                          </small>
                        </span>
                        <span aria-hidden="true">
                          {selectingWorkout &&
                          !existingExercises.some((i) => i.exercise_id === e.id)
                            ? "＋"
                            : "→"}
                        </span>
                      </button>
                      <button
                        disabled={busy}
                        aria-label={`Edit exercise ${e.name}`}
                        onClick={() => setEditor({ kind: "exercise", item: e })}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                  {!exercises.length && (
                    <p>
                      {search
                        ? "No matches in this category."
                        : "No active exercises in this category."}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
      </div>
      {detail && (
        <Modal
          labelledBy="library-exercise-detail"
          busy={busy}
          onClose={() => setDetail(null)}
        >
          <h2 id="library-exercise-detail">{detail.name}</h2>
          <p>
            {labels[detail.tracking_type]}
            {detail.tracking_type === "cardio"
              ? ` · ${detail.distance_unit}`
              : detail.tracking_type === "duration"
                ? " · seconds"
                : ` · ${detail.weight_unit}`}
          </p>
          {detail.notes && <p>{detail.notes}</p>}
          <div className="workout-actions">
            <button disabled={busy} onClick={() => onHistory(detail.id)}>
              View exercise history
            </button>
            <button disabled={busy} onClick={() => onProgress(detail.id)}>
              View exercise progress
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDetail(null);
                setEditor({ kind: "exercise", item: detail });
              }}
            >
              Edit exercise
            </button>
            <button disabled={busy} onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <p className="workout-note">
            To log sets, start a workout from Home or use Add exercise in an
            existing workout.
          </p>
        </Modal>
      )}
      {editor && (
        <Modal
          labelledBy="workout-library-editor"
          busy={busy}
          onClose={() => setEditor(null)}
        >
          <h2 id="workout-library-editor">
            {editor.item ? "Edit" : "New"} {editor.kind}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const common = {
                name: String(fd.get("name")).trim(),
                display_order: Number(fd.get("order")),
              };
              run(async () => {
                if (editor.kind === "category")
                  await api.saveCategory(editor.item?.id, common);
                else
                  await api.saveExercise(editor.item?.id, {
                    ...common,
                    ...(String(fd.get("category")) === editor.item?.category_id
                      ? {}
                      : { category_id: String(fd.get("category")) }),
                    tracking_type: fd.get("type") as api.TrackingType,
                    weight_unit: fd.get("weight-unit") as "kg" | "lb",
                    distance_unit: fd.get("distance-unit") as "km" | "mi",
                    notes: String(fd.get("notes")),
                    weight_increment: String(fd.get("increment")),
                    rest_seconds: Number(fd.get("rest")),
                  });
                setEditor(null);
              });
            }}
          >
            <label>
              {editor.kind === "category" ? "Category name" : "Exercise name"}
              <input
                name="name"
                defaultValue={editor.item?.name || ""}
                required
                maxLength={120}
                disabled={busy}
              />
            </label>
            <label>
              Display order
              <input
                name="order"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                defaultValue={editor.item?.display_order ?? 100}
                required
                disabled={busy}
              />
            </label>
            {editor.kind === "exercise" && (
              <>
                <label>
                  Category
                  <select
                    name="category"
                    defaultValue={
                      editor.item?.category_id ||
                      catalog.categories.find((c) => c.is_active)?.id
                    }
                    disabled={busy}
                    required
                  >
                    {catalog.categories
                      .filter(
                        (c) => c.is_active || c.id === editor.item?.category_id,
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {!c.is_active ? " (archived)" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Tracking type
                  <select
                    name="type"
                    defaultValue={editor.item?.tracking_type || "strength"}
                    disabled={busy}
                  >
                    {Object.entries(labels).map(([type, label]) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="workout-fields">
                  <label>
                    Weight unit
                    <select
                      name="weight-unit"
                      defaultValue={editor.item?.weight_unit || "kg"}
                      disabled={busy}
                    >
                      <option>kg</option>
                      <option>lb</option>
                    </select>
                  </label>
                  <label>
                    Distance unit
                    <select
                      name="distance-unit"
                      defaultValue={editor.item?.distance_unit || "km"}
                      disabled={busy}
                    >
                      <option>km</option>
                      <option>mi</option>
                    </select>
                  </label>
                  <label>
                    Weight increment
                    <input
                      name="increment"
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="9999.999"
                      defaultValue={editor.item?.weight_increment || "2.5"}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Rest (seconds)
                    <input
                      name="rest"
                      type="number"
                      min="0"
                      max="3600"
                      step="1"
                      defaultValue={editor.item?.rest_seconds ?? 90}
                      required
                      disabled={busy}
                    />
                  </label>
                </div>
                <label>
                  Exercise notes
                  <textarea
                    name="notes"
                    defaultValue={editor.item?.notes || ""}
                    maxLength={2000}
                    disabled={busy}
                  />
                </label>
                <p className="workout-note">
                  Type and unit changes apply to new workout occurrences only.
                  Recorded history keeps its original settings.
                </p>
              </>
            )}
            <div className="workout-actions">
              <button className="primary-button" disabled={busy}>
                Save {editor.kind}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
            </div>
          </form>
          {editor.item && (
            <div className="workout-archive">
              <p>Archiving keeps recorded history.</p>
              <button
                disabled={
                  busy ||
                  (editor.kind === "exercise" &&
                    !editor.item.is_active &&
                    !catalog.categories.find(
                      (c) => c.id === editor.item?.category_id,
                    )?.is_active)
                }
                onClick={() =>
                  run(async () => {
                    if (editor.kind === "category")
                      await api.saveCategory(editor.item!.id, {
                        is_active: !editor.item!.is_active,
                      });
                    else
                      await api.saveExercise(editor.item!.id, {
                        is_active: !editor.item!.is_active,
                      });
                    setEditor(null);
                  })
                }
              >
                {editor.item.is_active ? "Archive" : "Restore"} {editor.kind}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
