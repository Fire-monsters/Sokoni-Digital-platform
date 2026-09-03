import { Modal } from "./Modal";
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="small"
      title={title}
      description={description}
      footer={
        <>
          <button disabled={busy} onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            className={danger ? "danger-button" : "approve"}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {danger ? (
        <p className="dialog-warning">
          This action may affect active operations. Verify the details before continuing.
        </p>
      ) : null}
    </Modal>
  );
}
