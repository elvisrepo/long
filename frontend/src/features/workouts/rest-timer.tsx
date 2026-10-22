import { Modal } from "../../components/modal";
import { useEffect, useImperativeHandle, useState, type Ref } from "react";

export interface RestTimerHandle {
  completed: () => void;
  open: () => void;
}
export function RestTimer({
  seconds,
  dialogMode = false,
  ref,
  context = "",
  autoStart,
  onAutoStartChange,
  disabled = false,
}: {
  seconds: number;
  dialogMode?: boolean;
  ref?: Ref<RestTimerHandle>;
  context?: string;
  autoStart?: boolean;
  onAutoStartChange?: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<{ context: string; seconds: number }>();
  const duration = custom?.context === context ? custom.seconds : seconds;
  const [deadline, setDeadline] = useState<number>();
  const [now, setNow] = useState(() => Date.now());
  const [localAuto, setLocalAuto] = useState(false);
  const auto = autoStart ?? localAuto;
  const start = () => {
    const current = Date.now();
    setNow(current);
    setDeadline(current + duration * 1000);
  };
  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
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
  const clock = (
    <span role="timer" aria-label="Rest remaining">
      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
    </span>
  );
  const controls = (
    <>
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
            disabled={disabled}
            onChange={(e) =>
              onAutoStartChange
                ? onAutoStartChange(e.target.checked)
                : setLocalAuto(e.target.checked)
            }
          />
          Auto-start after completed set
        </label>
      </div>
      {finished && <p role="status">Rest finished.</p>}
      <small>
        Visual timer only. Background updates may be delayed; leaving Workouts
        or reloading clears the timer.
      </small>
    </>
  );
  if (dialogMode)
    return open ? (
      <Modal labelledBy="rest-timer-title" onClose={() => setOpen(false)}>
        <h2 id="rest-timer-title">Rest timer</h2>
        <p className="workout-rest-countdown">{clock}</p>
        {controls}
        <button onClick={() => setOpen(false)}>Close</button>
      </Modal>
    ) : null;
  return (
    <details className="workout-card" aria-label="Rest timer">
      <summary>Rest timer · {clock}</summary>
      {controls}
    </details>
  );
}
