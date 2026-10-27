import { useEffect, useId, useRef, useState } from "react";

export function ExerciseLibraryActions({
  name,
  busy,
  archived,
  restoreDisabled,
  onEdit,
  onHistory,
  onArchive,
  onDelete,
}: {
  name: string;
  busy: boolean;
  archived: boolean;
  restoreDisabled: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onArchive: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const actions = [
    { label: "Edit", action: onEdit },
    { label: "History", action: onHistory },
    {
      label: archived ? "Restore" : "Archive",
      action: onArchive,
      disabled: archived && restoreDisabled,
    },
    ...(onDelete
      ? [{ label: "Delete", action: onDelete, disabled: false }]
      : []),
  ];
  return (
    <div
      ref={root}
      className="workout-library-actions-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          const items = Array.from(
            root.current!.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]:not(:disabled)',
            ),
          );
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
                  items.length;
          items[next]?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        disabled={busy}
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={`Actions for ${name}`}
          className="workout-library-action-list"
        >
          {actions.map(({ label, action, disabled }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={label === "Delete" ? "workout-danger" : undefined}
              tabIndex={-1}
              disabled={busy || disabled}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                action();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
