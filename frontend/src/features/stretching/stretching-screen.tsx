import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { Modal } from "../../components/modal";
import { PageHeader } from "../../components/page-header";
import { PageState } from "../../components/page-state";
import { useMeQuery } from "../auth/use-me-query";
import { localDay, shiftDay } from "../recovery/recovery-dates";
import {
  getStretchCatalog,
  getStretchEntries,
  getStretchPreferences,
  setStretchCheckoff,
  updateStretchPreferences,
} from "./stretching-api";
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
    (exercise) => exercise.is_visible,
  );
  const completed = visibleExercises.filter((exercise) =>
    checkedIds.has(exercise.id),
  ).length;
  const hiddenExerciseIds = preferences.data.hidden_exercise_ids;
  const toggleExerciseVisibility = (exerciseId: string) => {
    const nextHidden = hiddenExerciseIds.includes(exerciseId)
      ? hiddenExerciseIds.filter((id) => id !== exerciseId)
      : [...hiddenExerciseIds, exerciseId];
    savePreferences.mutate({ hidden_exercise_ids: nextHidden });
  };

  return (
    <section className="stretching-screen">
      <PageHeader
        title="Stretching & Posture"
        eyebrow="DAILY MOVEMENT CHECKLIST"
        description="Choose a phase and record the mobility activities you did. The short cues are general reference material, not personalized medical advice."
      />
      <div className="stretching-date-controls date-navigation">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => selectDay(shiftDay(day, -1))}
        >
          ←
        </button>
        <label>
          Tracking date
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
        <button type="button" onClick={() => selectDay(today)}>
          Today
        </button>
      </div>
      <div
        className="stretching-phase-tabs"
        role="tablist"
        aria-label="Stretching phases"
      >
        {phases.map((phase) => {
          const count = phase.exercises.filter(
            (exercise) => exercise.is_visible && checkedIds.has(exercise.id),
          ).length;
          const visibleCount = phase.exercises.filter(
            (exercise) => exercise.is_visible,
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
                {count}/{visibleCount} complete
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
            <p>
              {completed} of {visibleExercises.length} checked for {day}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManageCatalog(true)}
            aria-label="Manage stretches"
          >
            Manage stretches
          </button>
          <span
            className="stretching-progress"
            aria-label={`${completed} of ${visibleExercises.length} complete`}
          >
            <span
              style={{
                width: `${visibleExercises.length ? (completed / visibleExercises.length) * 100 : 0}%`,
              }}
            />
          </span>
        </div>
        {checkoff.isError && (
          <p role="alert">
            {checkoff.error.message} Your change was not confirmed. Try again.
          </p>
        )}
        <div className="stretching-exercises">
          {visibleExercises.map((exercise) => {
            const checked = checkedIds.has(exercise.id);
            const image = exerciseImages[exercise.slug];
            return (
              <div
                className={`stretching-exercise${checked ? " is-checked" : ""}`}
                key={exercise.id}
              >
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
                {image && (
                  <button
                    type="button"
                    className="stretching-image-button"
                    aria-label={`Enlarge illustration of ${exercise.name}`}
                    onClick={() =>
                      setSelectedImage({ name: exercise.name, src: image })
                    }
                  >
                    <img
                      className="stretching-exercise-image"
                      src={image}
                      alt=""
                      loading="lazy"
                      width="640"
                      height="480"
                    />
                  </button>
                )}
                <label
                  className="stretching-exercise-copy"
                  htmlFor={`stretch-check-${exercise.id}`}
                >
                  <span className="stretching-exercise-heading">
                    <span>{exercise.name}</span>
                    {exercise.dosage && <small>{exercise.dosage}</small>}
                  </span>
                  {exercise.description && (
                    <small>{exercise.description}</small>
                  )}
                </label>
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
              <section key={phase.slug}>
                <h3>{phase.name}</h3>
                {phase.exercises.map((exercise) => {
                  const hidden = hiddenExerciseIds.includes(exercise.id);
                  return (
                    <div className="stretching-catalog-item" key={exercise.id}>
                      <span>{exercise.name}</span>
                      <button
                        type="button"
                        disabled={savePreferences.isPending}
                        onClick={() => toggleExerciseVisibility(exercise.id)}
                        aria-label={`${hidden ? "Show" : "Hide"} ${exercise.name}`}
                      >
                        {hidden ? "Show" : "Hide"}
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </Modal>
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
          <img
            className="stretching-image-expanded"
            src={selectedImage.src}
            alt={`Illustration of ${selectedImage.name}`}
          />
        </Modal>
      )}
    </section>
  );
}
