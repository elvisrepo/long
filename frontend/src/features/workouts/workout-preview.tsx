import { Modal } from "../../components/modal";
import { dayLabel, type NavigateWorkout } from "./workout-navigation";
import { WorkoutDayDetails } from "./workout-read-content";
export interface WorkoutPreviewNavigation {
  previous?: () => void;
  next?: () => void;
  label: string;
}
export function WorkoutPreview({
  owner,
  date,
  workoutId,
  navigate,
  onClose,
  navigation,
}: {
  owner: string;
  date: string;
  workoutId?: string;
  navigate: NavigateWorkout;
  onClose: () => void;
  navigation?: WorkoutPreviewNavigation;
}) {
  return (
    <Modal
      labelledBy="workout-preview-title"
      className="calendar-dialog workout-preview-modal"
      onClose={onClose}
    >
      <header className="calendar-dialog-header">
        <h2 id="workout-preview-title">{dayLabel(date)}</h2>
        {navigation && (
          <div className="calendar-workout-navigation">
            <button
              aria-label="Previous matching workout day"
              disabled={!navigation.previous}
              onClick={navigation.previous}
            >
              ←
            </button>
            <small>{navigation.label}</small>
            <button
              aria-label="Next matching workout day"
              disabled={!navigation.next}
              onClick={navigation.next}
            >
              →
            </button>
          </div>
        )}
      </header>
      <div className="calendar-dialog-body">
        <WorkoutDayDetails
          owner={owner}
          date={date}
          workoutId={workoutId}
          navigate={navigate}
          onNavigate={onClose}
        />
      </div>
      <footer className="calendar-dialog-footer">
        <button onClick={onClose}>Close</button>
        <button
          className="primary-button"
          onClick={() => {
            onClose();
            navigate({
              view: "home",
              date,
              ...(workoutId ? { session: workoutId } : {}),
            });
          }}
        >
          Go to workout
        </button>
      </footer>
    </Modal>
  );
}
