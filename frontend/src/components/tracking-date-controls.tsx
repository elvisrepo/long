import { useEffect, useId, useRef, useState } from "react";
import "./tracking-date-controls.css";

export function TrackingDateControls({
  day,
  today,
  onSelectDay,
}: {
  day: string;
  today: string;
  onSelectDay: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerId = useId();
  const controls = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !controls.current?.contains(event.target)
      )
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        calendar.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="tracking-date-controls" ref={controls}>
      <button
        type="button"
        ref={calendar}
        aria-label="Choose date"
        aria-expanded={open}
        aria-controls={pickerId}
        onClick={() => setOpen(!open)}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => {
          onSelectDay(today);
          setOpen(false);
        }}
      >
        Today
      </button>
      <div className="tracking-date-picker" id={pickerId} hidden={!open}>
        <label>
          Tracking date
          <input
            ref={field}
            type="date"
            value={day}
            onChange={(event) => {
              if (!event.target.value) return;
              onSelectDay(event.target.value);
              setOpen(false);
              calendar.current?.focus();
            }}
          />
        </label>
      </div>
    </div>
  );
}
