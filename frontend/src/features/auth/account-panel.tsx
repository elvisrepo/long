import { type FormEvent, useState } from "react";
import { Modal } from "../../components/modal";
import { deleteAccount, downloadAccountData } from "./account-api";

export function AccountPanel({
  onDeleted,
}: {
  onDeleted: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleExport() {
    setExporting(true);
    setMessage("");
    setError("");
    try {
      await downloadAccountData();
      setMessage("Account data downloaded. Check your downloads folder.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Account export failed.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="subscription-card" aria-label="Account data">
      <h2>Your account data</h2>
      <p className="settings-data-copy">
        Download your account, health records, sync history, and billing history
        as JSON. Available on every plan.
      </p>
      <div className="metric-dialog-actions">
        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          {exporting ? "Downloading…" : "Download account data"}
        </button>
        <button
          type="button"
          className="metric-danger-action"
          disabled={exporting}
          onClick={() => setOpen(true)}
        >
          Delete account
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <DeleteAccountDialog
          onClose={() => setOpen(false)}
          onDeleted={onDeleted}
        />
      ) : null}
    </section>
  );
}

function DeleteAccountDialog({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    if (!password || !confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteAccount(password);
    } catch (error) {
      setPassword("");
      setError(
        error instanceof Error ? error.message : "Account deletion failed.",
      );
      setBusy(false);
      return;
    }
    await onDeleted();
  }

  return (
    <Modal labelledBy="delete-account-title" busy={busy} onClose={onClose}>
      <div className="metric-dialog-header">
        <h2 id="delete-account-title">Delete your account?</h2>
        <button
          type="button"
          className="metric-dialog-close"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="metric-dialog-copy">
        This permanently removes your Longevity account, health records,
        preferences, and sync history. All devices will lose access. Download
        your account data first if you want to keep it. Records in Health
        Connect and your source app are unaffected.
      </p>
      <p className="metric-dialog-copy">
        Any active Stripe subscription will be cancelled immediately. You will
        lose any remaining paid access. This action does not automatically
        refund previous payments. Existing backups and Stripe records are
        retained separately from the live app database.
      </p>
      <form onSubmit={handleDelete}>
        <fieldset disabled={busy} className="export-fields">
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="account-delete-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I understand this permanently deletes my account.
          </label>
        </fieldset>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="metric-dialog-actions">
          <button
            type="submit"
            className="metric-danger-action"
            disabled={busy || !password || !confirmed}
          >
            {busy ? "Deleting…" : "Delete account permanently"}
          </button>
          <button
            type="button"
            className="metrics-secondary-action"
            disabled={busy}
            onClick={onClose}
          >
            Keep account
          </button>
        </div>
      </form>
    </Modal>
  );
}
