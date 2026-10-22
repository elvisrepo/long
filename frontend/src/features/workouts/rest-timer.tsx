import { Modal } from "../../components/modal";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

const storageKey = "longevity-rest-timer";
type Settings = {
  sound: boolean;
  vibrate: boolean;
  volume: number;
  durations: Record<string, { seconds: number; base: number }>;
};
function readSettings(): Settings {
  const defaults: Settings = {
    sound: true,
    vibrate: true,
    volume: 50,
    durations: {},
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!saved || typeof saved !== "object") return defaults;
    return {
      sound: typeof saved.sound === "boolean" ? saved.sound : true,
      vibrate: typeof saved.vibrate === "boolean" ? saved.vibrate : true,
      volume: Number.isFinite(saved.volume)
        ? Math.min(100, Math.max(0, saved.volume))
        : 50,
      durations:
        saved.durations && typeof saved.durations === "object"
          ? saved.durations
          : {},
    };
  } catch {
    return defaults;
  }
}

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
  const [settings, setSettings] = useState(readSettings);
  const saved = settings.durations[context];
  const duration =
    saved?.base === seconds &&
    Number.isInteger(saved.seconds) &&
    saved.seconds >= 0 &&
    saved.seconds <= 3600
      ? saved.seconds
      : seconds;
  const [deadline, setDeadline] = useState<number>();
  const [now, setNow] = useState(() => Date.now());
  const [localAuto, setLocalAuto] = useState(false);
  const [soundFailed, setSoundFailed] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef<number | undefined>(undefined);
  const auto = autoStart ?? localAuto;
  const soundSupported = typeof AudioContext !== "undefined";
  const vibrationSupported = typeof navigator.vibrate === "function";
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      /* Storage may be disabled. */
    }
  }, [settings]);
  useEffect(
    () => () => {
      void audio.current?.close().catch(() => {});
    },
    [],
  );
  function prepareSound() {
    if (!settings.sound || !soundSupported) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => setSoundFailed(true));
    } catch {
      setSoundFailed(true);
    }
  }
  function setDuration(value: number) {
    const next = Math.min(3600, Math.max(0, Math.trunc(value)));
    setSettings((current) => ({
      ...current,
      durations: {
        ...current.durations,
        [context]: { seconds: next, base: seconds },
      },
    }));
  }
  const start = () => {
    prepareSound();
    alerted.current = undefined;
    const current = Date.now();
    setNow(current);
    setDeadline(current + duration * 1000);
  };
  useImperativeHandle(ref, () => ({
    open: () => {
      prepareSound();
      setOpen(true);
    },
    completed: () => {
      if (auto && duration > 0) start();
    },
  }));
  const remaining =
    deadline === undefined
      ? duration
      : Math.max(0, Math.ceil((deadline - now) / 1000));
  const finished = deadline !== undefined && remaining === 0;
  const running = deadline !== undefined && !finished;
  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 500);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!finished || alerted.current === deadline) return;
    alerted.current = deadline;
    if (settings.vibrate && vibrationSupported) {
      try {
        navigator.vibrate([200, 100, 200, 100, 200]);
      } catch {
        /* Optional device capability. */
      }
    }
    if (settings.sound && settings.volume > 0 && audio.current) {
      try {
        const ctx = audio.current;
        const tone = ctx.createOscillator();
        const gain = ctx.createGain();
        tone.frequency.value = 880;
        gain.gain.value = settings.volume / 100;
        tone.connect(gain);
        gain.connect(ctx.destination);
        tone.start();
        tone.stop(ctx.currentTime + 0.6);
      } catch {
        setSoundFailed(true);
      }
    }
  }, [
    finished,
    deadline,
    settings.sound,
    settings.vibrate,
    settings.volume,
    vibrationSupported,
  ]);
  const clock = (
    <span role="timer" aria-label="Rest remaining">
      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
    </span>
  );
  const controls = (
    <div className="workout-rest-controls">
      <div className="workout-rest-duration">
        <button
          aria-label="Decrease rest"
          disabled={running || duration < 1}
          onClick={() => setDuration(duration - 5)}
        >
          −
        </button>
        <label>
          Rest seconds
          <input
            type="number"
            min="0"
            max="3600"
            step="1"
            value={duration}
            disabled={running}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>
        <button
          aria-label="Increase rest"
          disabled={running || duration >= 3600}
          onClick={() => setDuration(duration + 5)}
        >
          ＋
        </button>
      </div>
      {dialogMode && running && (
        <p className="workout-rest-countdown">{clock}</p>
      )}
      <div className="workout-rest-options">
        <label className="workout-check">
          <input
            type="checkbox"
            checked={settings.vibrate}
            disabled={!vibrationSupported}
            onChange={(e) =>
              setSettings({ ...settings, vibrate: e.target.checked })
            }
          />
          Vibrate
          {!vibrationSupported && <small>Unavailable on this browser</small>}
        </label>
        <label className="workout-check">
          <input
            type="checkbox"
            checked={settings.sound}
            disabled={!soundSupported}
            onChange={(e) =>
              setSettings({ ...settings, sound: e.target.checked })
            }
          />
          Sound
          {!soundSupported && <small>Unavailable on this browser</small>}
        </label>
        <label className="workout-check">
          <input
            type="checkbox"
            checked={auto}
            disabled={disabled}
            onChange={(e) => {
              prepareSound();
              if (onAutoStartChange) onAutoStartChange(e.target.checked);
              else setLocalAuto(e.target.checked);
            }}
          />
          Auto-start after completed set
        </label>
      </div>
      <label className="workout-rest-volume">
        Volume
        <input
          aria-label="Volume"
          type="range"
          min="0"
          max="100"
          step="1"
          value={settings.volume}
          disabled={!settings.sound || !soundSupported}
          onChange={(e) =>
            setSettings({ ...settings, volume: Number(e.target.value) })
          }
        />
        <span aria-hidden="true">{settings.volume}%</span>
      </label>
      <div className="workout-actions">
        <button
          className="primary-button"
          disabled={duration < 1}
          onClick={start}
        >
          {running ? "Restart rest" : "Start rest"}
        </button>
        {deadline !== undefined && (
          <button onClick={() => setDeadline(undefined)}>Stop rest</button>
        )}
      </div>
      {finished && <p role="status">Rest finished.</p>}
      {soundFailed && (
        <p role="status">
          Sound could not play. Check browser audio permissions.
        </p>
      )}
      <small>
        Alerts may be delayed in the background or while your phone is locked.
        Leaving Workouts or reloading clears the countdown.
      </small>
    </div>
  );
  if (dialogMode)
    return open ? (
      <Modal
        labelledBy="rest-timer-title"
        className="workout-rest-modal"
        onClose={() => setOpen(false)}
      >
        <h2 id="rest-timer-title">Rest timer</h2>
        {!running && <span className="visually-hidden">{clock}</span>}
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
