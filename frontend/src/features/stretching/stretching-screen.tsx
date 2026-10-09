import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "../../components/page-header";
import { PageState } from "../../components/page-state";
import { useMeQuery } from "../auth/use-me-query";
import { localDay, shiftDay } from "../recovery/recovery-dates";
import {
  getStretchCatalog,
  getStretchEntries,
  setStretchCheckoff,
} from "./stretching-api";
import "./stretching.css";

export function StretchingScreen() {
  const client = useQueryClient();
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const [day, setDay] = useState(today);
  const [phaseSlug, setPhaseSlug] = useState<"lower-body" | "upper-body">(
    "lower-body",
  );
  const catalog = useQuery({
    queryKey: ["stretching", owner, "catalog"],
    queryFn: getStretchCatalog,
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
  const selectDay = (nextDay: string) => {
    if (nextDay !== day) checkoff.reset();
    setDay(nextDay);
  };
  if (catalog.isPending || entries.isPending)
    return <PageState message="Loading stretching checklist…" />;
  if (catalog.isError || entries.isError)
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
  const completed = currentPhase.exercises.filter((exercise) =>
    checkedIds.has(exercise.id),
  ).length;

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
          const count = phase.exercises.filter((exercise) =>
            checkedIds.has(exercise.id),
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
                {count}/{phase.exercises.length} complete
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
              {completed} of {currentPhase.exercises.length} checked for {day}
            </p>
          </div>
          <span
            className="stretching-progress"
            aria-label={`${completed} of ${currentPhase.exercises.length} complete`}
          >
            <span
              style={{
                width: `${currentPhase.exercises.length ? (completed / currentPhase.exercises.length) * 100 : 0}%`,
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
          {currentPhase.exercises.map((exercise) => {
            const checked = checkedIds.has(exercise.id);
            return (
              <label
                className={`stretching-exercise${checked ? " is-checked" : ""}`}
                key={exercise.id}
              >
                <input
                  type="checkbox"
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
                <span className="stretching-exercise-copy">
                  <span className="stretching-exercise-heading">
                    <span>{exercise.name}</span>
                    {exercise.dosage && <small>{exercise.dosage}</small>}
                  </span>
                  {exercise.description && (
                    <small>{exercise.description}</small>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        <p className="stretching-disclaimer">
          General reference cues only—not personalized exercise or medical
          advice.
        </p>
      </section>
    </section>
  );
}
