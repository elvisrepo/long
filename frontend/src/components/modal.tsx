import { type ReactNode, useEffect, useRef } from "react";

export function Modal({
  children,
  labelledBy,
  onClose,
  busy = false,
  className = "",
  closeOnBackdrop = false,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  closeOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`metric-dialog app-modal ${className}`}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onMouseDown={(event) => {
        if (!closeOnBackdrop || busy || event.target !== event.currentTarget)
          return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          // Avoid the pointer's default focus move after restoring the opener.
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
