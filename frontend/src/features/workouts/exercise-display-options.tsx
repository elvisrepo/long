import { useEffect, useId, useRef, useState } from "react";

export type LibraryDisplayOptions = {
  workoutCount: boolean;
  lastUsed: boolean;
  categoryColours: boolean;
};

export function ExerciseDisplayOptions({
  value,
  onChange,
  onReorder,
}: {
  value: LibraryDisplayOptions;
  onChange: (key: keyof LibraryDisplayOptions, checked: boolean) => void;
  onReorder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector("input")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div
      className="workout-library-display-menu"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Display options"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        Display options <span aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div
          id={id}
          role="group"
          aria-label="Exercise details"
          className="workout-library-display-options"
        >
          <label>
            Workout count
            <input
              type="checkbox"
              checked={value.workoutCount}
              onChange={(event) =>
                onChange("workoutCount", event.target.checked)
              }
            />
          </label>
          <label>
            Last used
            <input
              type="checkbox"
              checked={value.lastUsed}
              onChange={(event) => onChange("lastUsed", event.target.checked)}
            />
          </label>
          <small>Workouts with completed sets</small>
          <label>
            Category colours
            <input
              type="checkbox"
              checked={value.categoryColours}
              onChange={(event) =>
                onChange("categoryColours", event.target.checked)
              }
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
              onReorder();
            }}
          >
            Reorder categories
          </button>
        </div>
      )}
    </div>
  );
}
