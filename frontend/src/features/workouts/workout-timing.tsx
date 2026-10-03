import { useEffect, useState } from "react";
import { Modal } from "../../components/modal";
import { updateWorkout, type Workout } from "./workout-api";
import type { RunAction } from "./workout-navigation";
import { elapsedWorkoutSeconds, durationLabel } from "./workout-timing-format";

function DurationClock({ workout }: { workout: Workout }) {
  const [clock, setClock] = useState(() => {
    const now = Date.now();
    return { received: now, now };
  });
  useEffect(() => {
    if (!workout.timer_started_at || workout.is_finished) return;
    const tick = () => setClock((value) => ({ ...value, now: Date.now() }));
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [workout.timer_started_at, workout.is_finished]);
  const serverNow = workout.timer_server_now
    ? Date.parse(workout.timer_server_now) +
      Math.max(0, clock.now - clock.received)
    : clock.now;
  return (
    <span role="timer" aria-label="Workout elapsed">
      {durationLabel(elapsedWorkoutSeconds(workout, serverNow))}
    </span>
  );
}

export function WorkoutTiming({
  workout,
  busy,
  run,
}: {
  workout: Workout;
  busy: boolean;
  run: RunAction;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locked = busy || pending;
  const running = !!workout.timer_started_at;
  function save(data: Parameters<typeof updateWorkout>[1], correction = false) {
    if (locked) return;
    setPending(true);
    setError("");
    setMessage("");
    run(async () => {
      try {
        await updateWorkout(workout.id, data);
        if (correction) setEditing(false);
        setMessage(
          correction
            ? "Duration saved; timer paused."
            : data.timer_action === "start"
              ? "Timer started."
              : "Timer paused.",
        );
      } catch {
        setError(
          "Timing couldn't be saved. Refresh to check the server state before retrying.",
        );
      } finally {
        setPending(false);
      }
    });
  }
  const saved = workout.elapsed_seconds ?? workout.duration_seconds ?? 0;
  return (
    <section className="workout-inset" aria-label="Workout duration">
      <h3>
        Workout duration ·{" "}
        <DurationClock
          key={`${workout.id}:${workout.timer_server_now}:${workout.timer_started_at}:${workout.duration_seconds}`}
          workout={workout}
        />
      </h3>
      <div className="workout-actions">
        <button
          disabled={locked || workout.is_finished}
          onClick={() => save({ timer_action: running ? "pause" : "start" })}
        >
          {running
            ? "Pause timer"
            : workout.duration_seconds == null
              ? "Start timer"
              : "Resume timer"}
        </button>
        <button
          disabled={locked}
          onClick={() => {
            setEditing(true);
            setError("");
          }}
        >
          Correct duration
        </button>
      </div>
      <p className="workout-note">
        {running
          ? "Running"
          : workout.duration_seconds == null
            ? "Not started"
            : "Paused"}
        . Saved across refreshes. Rest between sets counts unless paused. Finish
        stops the timer; reopening does not restart it. Maximum 7 days.
      </p>
      {error && !editing && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {editing && (
        <Modal
          labelledBy="duration-title"
          busy={locked}
          onClose={() => setEditing(false)}
        >
          <h2 id="duration-title">Correct workout duration</h2>
          <p>
            Replace the total elapsed time and pause the timer. This does not
            alter sets or completion.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const total =
                Number(data.get("hours")) * 3600 +
                Number(data.get("minutes")) * 60 +
                Number(data.get("seconds"));
              if (!Number.isInteger(total) || total < 0 || total > 604800) {
                setError("Choose a duration from 0 to 168 hours.");
                return;
              }
              save({ duration_seconds: total }, true);
            }}
          >
            <label>
              Workout hours
              <input
                name="hours"
                type="number"
                min="0"
                max="168"
                step="1"
                required
                defaultValue={Math.floor(saved / 3600)}
                disabled={locked}
              />
            </label>
            <label>
              Workout minutes
              <input
                name="minutes"
                type="number"
                min="0"
                max="59"
                step="1"
                required
                defaultValue={Math.floor(saved / 60) % 60}
                disabled={locked}
              />
            </label>
            <label>
              Workout seconds
              <input
                name="seconds"
                type="number"
                min="0"
                max="59"
                step="1"
                required
                defaultValue={saved % 60}
                disabled={locked}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button disabled={locked}>Save duration</button>
          </form>
          <div className="workout-actions">
            <button
              disabled={locked}
              onClick={() => save({ duration_seconds: null }, true)}
            >
              Clear duration
            </button>
            <button disabled={locked} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
