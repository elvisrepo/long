import { Modal } from "../../components/modal";
import type { Workout } from "./workout-api";
import type { RunAction } from "./workout-navigation";
import { WorkoutExerciseLog } from "./workout-exercise-log";

export function WorkoutNavigationPanel({
  workout,
  currentId,
  busy,
  run,
  onSelect,
  onAdd,
  onGroup,
  onHome,
  onClose,
}: {
  workout: Workout;
  currentId: string;
  busy: boolean;
  run: RunAction;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onGroup: () => void;
  onHome: () => void;
  onClose: () => void;
}) {
  const current = workout.exercises.find((item) => item.id === currentId);
  return (
    <Modal
      labelledBy="exercise-picker-title"
      className="workout-navigation-panel"
      closeOnBackdrop
      busy={busy}
      onClose={onClose}
    >
      <header className="workout-navigation-header">
        <div>
          <h2 id="exercise-picker-title">Exercises in this workout</h2>
          <p>
            {workout.exercises.length} exercises · Hold or drag a handle to
            reorder
          </p>
        </div>
        <button
          aria-label="Close navigation panel"
          title="Close navigation panel"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="workout-navigation-body">
        <WorkoutExerciseLog
          workout={workout}
          busy={busy}
          run={run}
          navigation
          currentExerciseId={currentId}
          onOpen={onSelect}
        />
      </div>
      <footer className="workout-navigation-footer">
        <button disabled={busy || workout.is_finished} onClick={onAdd}>
          <span aria-hidden="true">＋</span> Add exercise
        </button>
        <button disabled={busy || workout.is_finished} onClick={onGroup}>
          <span aria-hidden="true">↗</span>{" "}
          {current?.group_name ? "Edit group" : "Add to group"}
        </button>
        <button disabled={busy} onClick={onHome}>
          <span aria-hidden="true">⌂</span> Home
        </button>
      </footer>
    </Modal>
  );
}
