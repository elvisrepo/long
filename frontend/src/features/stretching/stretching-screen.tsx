import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { Modal } from "../../components/modal";
import { PageState } from "../../components/page-state";
import { useMeQuery } from "../auth/use-me-query";
import {
  localDay,
  shiftDay,
  trackingDateLabel,
} from "../recovery/recovery-dates";
import {
  archiveCustomStretch,
  createCustomStretch,
  getStretchCatalog,
  getStretchEntries,
  getStretchPreferences,
  setStretchCheckoff,
  updateCustomStretch,
  updateStretchPreferences,
  type StretchExercise,
  type StretchExerciseInput,
} from "./stretching-api";
import { StretchExerciseEditor } from "./stretch-exercise-editor";
import { StretchImage } from "./stretch-image";
import { exerciseImages } from "./stretching-images";
import "./stretching.css";

export function StretchingScreen() {
  const client = useQueryClient();
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const [day, setDay] = useState(today);
  const [phaseSlug, setPhaseSlug] = useState<"lower-body" | "upper-body">(
    "lower-body",
  );
  const [selectedImage, setSelectedImage] = useState<{
    name: string;
    src: string;
  } | null>(null);
  const [manageCatalog, setManageCatalog] = useState(false);
  const [catalogTab, setCatalogTab] = useState<
    "built-in" | "custom" | "archived"
  >("built-in");
  const [editingExercise, setEditingExercise] = useState<
    StretchExercise | "new" | null
  >(null);
  const catalog = useQuery({
    queryKey: ["stretching", owner, "catalog"],
    queryFn: getStretchCatalog,
    enabled: !!owner,
  });
  const preferences = useQuery({
    queryKey: ["stretching", owner, "preferences"],
    queryFn: getStretchPreferences,
    enabled: !!owner,
  });
  const entries = useQuery({
    queryKey: ["stretching", owner, "entries", day],
    queryFn: () => getStretchEntries(day, day),
    placeholderData: keepPreviousData,
    enabled: !!owner,
  });
  const days = Array.from({ length: 7 }, (_, index) =>
    shiftDay(today, index - 6),
  );
  const history = useQuery({
    queryKey: ["stretching", owner, "entries", "history", today],
    queryFn: () => getStretchEntries(days[0], today),
    enabled: !!owner,
  });
  const checkoff = useMutation({
    mutationFn: ({
      id,
      day: targetDay,
      checked,
    }: {
      id: string;
      day: string;
      checked: boolean;
    }) => setStretchCheckoff(id, targetDay, checked),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["stretching", owner, "entries"] }),
  });
  const savePreferences = useMutation({
    mutationFn: updateStretchPreferences,
    onSuccess: (next) => {
      client.setQueryData(["stretching", owner, "preferences"], next);
      client.invalidateQueries({ queryKey: ["stretching", owner, "catalog"] });
    },
  });
  const saveExercise = useMutation({
    mutationFn: (input: StretchExerciseInput) =>
      editingExercise === "new"
        ? createCustomStretch(input)
        : updateCustomStretch(editingExercise!.id, input),
    onSuccess: () => {
      setEditingExercise(null);
      client.invalidateQueries({ queryKey: ["stretching", owner, "catalog"] });
    },
  });
  const changeExerciseState = useMutation({
    mutationFn: async ({
      exercise,
      active,
    }: {
      exercise: StretchExercise;
      active: boolean;
    }): Promise<void> => {
      if (active) {
        await updateCustomStretch(exercise.id, {
          phase: exercise.phase,
          name: exercise.name,
          description: exercise.description,
          dosage: exercise.dosage,
          is_active: true,
        });
      } else {
        await archiveCustomStretch(exercise.id);
      }
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["stretching", owner, "catalog"] }),
  });
  const selectDay = (nextDay: string) => {
    if (nextDay !== day) checkoff.reset();
    setDay(nextDay);
  };
  if (catalog.isPending || entries.isPending || preferences.isPending)
    return <PageState message="Loading stretching checklist…" />;
  if (catalog.isError || entries.isError || preferences.isError)
    return (
      <PageState message="Stretching failed to load. Please try again." error />
    );

  const phases = catalog.data.phases;
  const currentPhase =
    phases.find((phase) => phase.slug === phaseSlug) ?? phases[0];
  if (!currentPhase)
    return <PageState message="No stretching exercises are available yet." />;
  const checkedIds = new Set(
    entries.data
      .filter((entry) => entry.performed_on === day)
      .map((entry) => entry.exercise_id),
  );
  const visibleExercises = currentPhase.exercises.filter(
    (exercise) => exercise.is_active && exercise.is_visible,
  );
  const recordedDays = new Set(
    (history.data ?? []).map((entry) => entry.performed_on),
  ).size;
  const hiddenExerciseIds = preferences.data.hidden_exercise_ids;
  const toggleExerciseVisibility = (exerciseId: string) => {
    const nextHidden = hiddenExerciseIds.includes(exerciseId)
      ? hiddenExerciseIds.filter((id) => id !== exerciseId)
      : [...hiddenExerciseIds, exerciseId];
    savePreferences.mutate({ hidden_exercise_ids: nextHidden });
  };

  return (
    <section className="stretching-screen">
      <header className="stretching-heading">
        <h1>Stretching &amp; Posture</h1>
        <p>
          Record the stretches you do. Illustrations and cues are general
          reference material.
        </p>
      </header>
      <section className="stretching-day-context" aria-label="Daily tracking">
        <div className="stretching-day-header">
          <div>
            <h2>{trackingDateLabel(day, today)}</h2>
            <p role="status">
              {entries.isFetching
                ? "Loading stretches…"
                : `${checkedIds.size} ${checkedIds.size === 1 ? "stretch" : "stretches"} recorded · both phases`}
            </p>
            {(checkoff.isPending || checkoff.isSuccess) && (
              <p role="status">
                {checkoff.isPending || entries.isFetching ? "Saving…" : "Saved"}
              </p>
            )}
          </div>
          <div className="stretching-date-controls">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => selectDay(shiftDay(day, -1))}
            >
              ←
            </button>
            <label>
              <span className="visually-hidden">Tracking date</span>
              <input
                type="date"
                value={day}
                onChange={(event) =>
                  event.target.value && selectDay(event.target.value)
                }
              />
            </label>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => selectDay(shiftDay(day, 1))}
            >
              →
            </button>
            <button
              type="button"
              onClick={() => selectDay(localDay(new Date()))}
            >
              Today
            </button>
          </div>
        </div>
        <div role="group" aria-label="Last 7 days">
          {history.isPending ? (
            <p className="stretching-history-caption" role="status">
              Loading recent records…
            </p>
          ) : history.isError ? (
            <p role="alert">
              Recent records could not be loaded.{" "}
              <button type="button" onClick={() => history.refetch()}>
                Retry recent records
              </button>
            </p>
          ) : (
            <>
              <ul className="stretching-history">
                {days.map((date) => {
                  const count = history.data.filter(
                    (entry) => entry.performed_on === date,
                  ).length;
                  const parsed = new Date(`${date}T12:00:00`);
                  return (
                    <li key={date}>
                      <button
                        type="button"
                        aria-pressed={date === day}
                        aria-label={`${date}: ${count} ${count === 1 ? "stretch" : "stretches"} recorded`}
                        onClick={() => selectDay(date)}
                      >
                        <span>
                          {parsed.toLocaleDateString(undefined, {
                            weekday: "short",
                          })}
                        </span>
                        <strong>{parsed.getDate()}</strong>
                        <small>{count}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="stretching-history-caption">
                Past 7 days · {recordedDays}{" "}
                {recordedDays === 1 ? "day" : "days"} with records · counts
                include hidden and archived stretches, not targets
              </p>
            </>
          )}
        </div>
      </section>
      <div
        className="stretching-phase-tabs"
        role="tablist"
        aria-label="Stretching phases"
      >
        {phases.map((phase) => {
          const count = phase.exercises.filter(
            (exercise) =>
              exercise.is_active &&
              exercise.is_visible &&
              checkedIds.has(exercise.id),
          ).length;
          const visibleCount = phase.exercises.filter(
            (exercise) => exercise.is_active && exercise.is_visible,
          ).length;
          return (
            <button
              key={phase.slug}
              id={`stretch-tab-${phase.slug}`}
              type="button"
              role="tab"
              aria-selected={phase.slug === currentPhase.slug}
              aria-controls="stretch-phase-panel"
              onClick={() => setPhaseSlug(phase.slug)}
            >
              <span>{phase.name}</span>
              <small>
                {entries.isFetching ? "…" : count} logged · {visibleCount}{" "}
                available
              </small>
            </button>
          );
        })}
      </div>
      <section
        className="stretching-panel"
        id="stretch-phase-panel"
        role="tabpanel"
        aria-labelledby={`stretch-tab-${currentPhase.slug}`}
      >
        <div className="stretching-panel-heading">
          <div>
            <h2>{currentPhase.name}</h2>
            <p>Choose what you did; no need to check every stretch.</p>
          </div>
          <div className="stretching-editor-actions">
            <button
              type="button"
              onClick={() => {
                setCatalogTab("built-in");
                setManageCatalog(true);
              }}
              aria-label="Manage stretches"
            >
              Manage
            </button>
            <button
              type="button"
              aria-label="Add custom stretch"
              onClick={() => {
                saveExercise.reset();
                setEditingExercise("new");
              }}
            >
              + Custom stretch
            </button>
          </div>
        </div>
        {checkoff.isError && (
          <p role="alert">
            {checkoff.error.message} Your change was not confirmed. Try again.
          </p>
        )}
        <div className="stretching-exercises">
          {visibleExercises.map((exercise) => {
            const checked = checkedIds.has(exercise.id);
            const image = exercise.image_url || exerciseImages[exercise.slug];
            return (
              <div
                className={`stretching-exercise${checked ? " is-checked" : ""}${image ? "" : " has-no-image"}`}
                key={exercise.id}
              >
                <label className="stretching-check-target">
                  <input
                    type="checkbox"
                    id={`stretch-check-${exercise.id}`}
                    aria-label={exercise.name}
                    checked={checked}
                    disabled={checkoff.isPending || entries.isFetching}
                    onChange={(event) =>
                      checkoff.mutate({
                        id: exercise.id,
                        day,
                        checked: event.target.checked,
                      })
                    }
                  />
                </label>
                {image && (
                  <button
                    type="button"
                    className="stretching-image-button"
                    aria-label={`Enlarge illustration of ${exercise.name}`}
                    onClick={() =>
                      setSelectedImage({ name: exercise.name, src: image })
                    }
                  >
                    <StretchImage
                      className="stretching-exercise-image"
                      src={image}
                      alt=""
                      loading="lazy"
                      width={640}
                      height={480}
                    />
                  </button>
                )}
                <div className="stretching-exercise-copy">
                  <label
                    className="stretching-exercise-heading"
                    htmlFor={`stretch-check-${exercise.id}`}
                  >
                    {exercise.name}
                  </label>
                  {exercise.dosage && (
                    <small className="stretching-dose">{exercise.dosage}</small>
                  )}
                  {exercise.description && (
                    <details className="stretching-instructions">
                      <summary>Instructions</summary>
                      <p>{exercise.description}</p>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
          {visibleExercises.length === 0 && (
            <p className="stretching-empty-state">
              No stretches are visible. Use Manage stretches to restore the
              built-in catalog.
            </p>
          )}
        </div>
        <p className="stretching-disclaimer">
          General reference cues only—not personalized exercise or medical
          advice.
        </p>
      </section>
      {manageCatalog && (
        <Modal
          labelledBy="stretch-catalog-dialog-title"
          onClose={() => setManageCatalog(false)}
          closeOnBackdrop
          className="stretching-catalog-dialog"
        >
          <div className="metric-dialog-header">
            <h2 id="stretch-catalog-dialog-title">Manage stretches</h2>
            <button
              type="button"
              className="metric-dialog-close"
              aria-label="Close stretch management"
              onClick={() => setManageCatalog(false)}
            >
              Close
            </button>
          </div>
          <p>
            Hide built-in stretches from your daily checklist. This only affects
            your account; saved check-offs are kept.
          </p>
          <div
            className="stretching-management-tabs"
            role="tablist"
            aria-label="Stretch catalog groups"
          >
            {(["built-in", "custom", "archived"] as const).map((tab) => {
              const count = phases
                .flatMap((p) => p.exercises)
                .filter((e) =>
                  tab === "built-in"
                    ? !e.is_custom
                    : e.is_custom && e.is_active === (tab === "custom"),
                ).length;
              return (
                <button
                  type="button"
                  role="tab"
                  id={`stretch-manage-${tab}`}
                  aria-controls="stretch-manage-panel"
                  aria-selected={catalogTab === tab}
                  key={tab}
                  onClick={() => setCatalogTab(tab)}
                >
                  {tab === "built-in"
                    ? "Built-in"
                    : tab === "custom"
                      ? "Custom"
                      : "Archived"}{" "}
                  ({count})
                </button>
              );
            })}
          </div>
          <div
            role="tabpanel"
            id="stretch-manage-panel"
            aria-labelledby={`stretch-manage-${catalogTab}`}
          >
            {catalogTab !== "built-in" && (
              <>
                <p>
                  Only you can see your custom stretches. Archiving keeps their
                  past check-offs.
                </p>
                <div className="stretching-catalog-list">
                  {phases.flatMap((phase) =>
                    phase.exercises
                      .filter(
                        (e) =>
                          e.is_custom &&
                          e.is_active === (catalogTab === "custom"),
                      )
                      .map((exercise) => (
                        <div
                          className="stretching-catalog-item"
                          key={exercise.id}
                        >
                          <span>
                            {exercise.name}
                            <small>{phase.name}</small>
                          </span>
                          <span className="stretching-editor-actions">
                            <button
                              type="button"
                              aria-label={`Edit ${exercise.name}`}
                              onClick={() => {
                                setManageCatalog(false);
                                saveExercise.reset();
                                setEditingExercise(exercise);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              aria-label={`${exercise.is_active ? "Archive" : "Restore"} ${exercise.name}`}
                              disabled={changeExerciseState.isPending}
                              onClick={() =>
                                changeExerciseState.mutate({
                                  exercise,
                                  active: !exercise.is_active,
                                })
                              }
                            >
                              {exercise.is_active ? "Archive" : "Restore"}
                            </button>
                          </span>
                        </div>
                      )),
                  )}
                  {!phases.some((p) =>
                    p.exercises.some(
                      (e) =>
                        e.is_custom &&
                        e.is_active === (catalogTab === "custom"),
                    ),
                  ) && (
                    <p>
                      {catalogTab === "custom"
                        ? "No active custom stretches."
                        : "No archived stretches."}
                    </p>
                  )}
                </div>
              </>
            )}
            {changeExerciseState.isError && (
              <p role="alert">{changeExerciseState.error.message}</p>
            )}
            {catalogTab === "built-in" && (
              <>
                <label className="stretching-catalog-toggle">
                  <input
                    type="checkbox"
                    aria-label="Show built-in stretches"
                    checked={preferences.data.show_shared_exercises}
                    disabled={savePreferences.isPending}
                    onChange={(event) =>
                      savePreferences.mutate({
                        show_shared_exercises: event.target.checked,
                      })
                    }
                  />
                  Show built-in stretches
                </label>
                {savePreferences.isError && (
                  <p role="alert">{savePreferences.error.message}</p>
                )}
                <div className="stretching-catalog-list">
                  {phases.map((phase) => (
                    <details open key={phase.slug}>
                      <summary>{phase.name}</summary>
                      {phase.exercises
                        .filter((exercise) => !exercise.is_custom)
                        .map((exercise) => {
                          const hidden = hiddenExerciseIds.includes(
                            exercise.id,
                          );
                          return (
                            <div
                              className="stretching-catalog-item"
                              key={exercise.id}
                            >
                              <span>{exercise.name}</span>
                              <button
                                type="button"
                                disabled={savePreferences.isPending}
                                onClick={() =>
                                  toggleExerciseVisibility(exercise.id)
                                }
                                aria-label={`${hidden ? "Show" : "Hide"} ${exercise.name}`}
                              >
                                {hidden ? "Show" : "Hide"}
                              </button>
                            </div>
                          );
                        })}
                    </details>
                  ))}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
      {editingExercise && (
        <StretchExerciseEditor
          exercise={editingExercise === "new" ? undefined : editingExercise}
          initialPhase={currentPhase.slug}
          onClose={() => setEditingExercise(null)}
          onSave={(input) => saveExercise.mutate(input)}
          pending={saveExercise.isPending}
          error={saveExercise.isError ? saveExercise.error.message : undefined}
        />
      )}
      {selectedImage && (
        <Modal
          labelledBy="stretch-image-dialog-title"
          onClose={() => setSelectedImage(null)}
          closeOnBackdrop
          className="stretching-image-dialog"
        >
          <div className="metric-dialog-header">
            <h2 id="stretch-image-dialog-title">{selectedImage.name}</h2>
            <button
              type="button"
              className="metric-dialog-close"
              aria-label="Close image"
              onClick={() => setSelectedImage(null)}
            >
              Close
            </button>
          </div>
          <StretchImage
            className="stretching-image-expanded"
            src={selectedImage.src}
            alt={`Illustration of ${selectedImage.name}`}
          />
        </Modal>
      )}
    </section>
  );
}
