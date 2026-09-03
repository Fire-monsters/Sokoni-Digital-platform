import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = "medium",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "small" | "medium" | "large";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      className={`modal ${size}`}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="overlay-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button autoFocus className="overlay-close" aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-content">{children}</div>
      {footer ? <footer className="overlay-footer">{footer}</footer> : null}
    </dialog>
  );
}
