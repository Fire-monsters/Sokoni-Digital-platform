import { useEffect, useRef, type ReactNode } from "react";
export function DetailDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const drawer = ref.current;
    if (!drawer) return;
    if (open && !drawer.open) drawer.showModal();
    else if (!open && drawer.open) drawer.close();
  }, [open]);
  return (
    <dialog
      className="detail-drawer"
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
        <button autoFocus className="overlay-close" aria-label="Close details" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="drawer-content">{children}</div>
      {footer ? <footer className="overlay-footer">{footer}</footer> : null}
    </dialog>
  );
}
