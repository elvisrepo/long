import { useEffect, useImperativeHandle, useState, type Ref } from "react";

export interface RestTimerHandle {
  completed: () => void;
}
export function RestTimer({
  seconds,
  ref,
  context = "",
}: {
  seconds: number;
  ref?: Ref<RestTimerHandle>;
  context?: string;
}) {
  const [custom, setCustom] = useState<{ context: string; seconds: number }>();
  const duration = custom?.context === context ? custom.seconds : seconds;
  const [deadline, setDeadline] = useState<number>();
  const [now, setNow] = useState(() => Date.now());
  const [auto, setAuto] = useState(false);
  const start = () => {
    const current = Date.now();
    setNow(current);
    setDeadline(current + duration * 1000);
  };
  useImperativeHandle(ref, () => ({
    completed: () => {
      if (auto && duration > 0) start();
    },
  }));
  const remaining =
    deadline === undefined
      ? duration
      : Math.max(0, Math.ceil((deadline - now) / 1000));
  const finished = deadline !== undefined && remaining === 0;
  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 500);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <details className="workout-card" aria-label="Rest timer">
      <summary>
        Rest timer ·{" "}
        <span role="timer" aria-label="Rest remaining">
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
        </span>
      </summary>
      <div className="workout-actions">
        <label>
          Rest seconds
          <input
            type="number"
            min="0"
            max="3600"
            step="1"
            value={duration}
            onChange={(e) =>
              setCustom({
                context,
                seconds: Math.min(
                  3600,
                  Math.max(0, Math.trunc(Number(e.target.value))),
                ),
              })
            }
          />
        </label>
        <button disabled={duration < 1} onClick={start}>
          Start rest
        </button>
        <button
          disabled={deadline === undefined}
          onClick={() => setDeadline(undefined)}
        >
          Stop rest
        </button>
        <label className="workout-check">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Auto-start after completed set
        </label>
      </div>
      {finished && <p role="status">Rest finished.</p>}
      <small>
        Visual timer only. Background updates may be delayed; leaving Workouts
        or reloading clears the timer.
      </small>
    </details>
  );
}
