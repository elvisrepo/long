import { type FormEvent, useState } from "react";
import { Modal } from "../../components/modal";
import { downloadMetricEntriesCsv } from "./metric-entry-export-api";
import { useMetricDefinitionsQuery } from "./use-metric-definitions-query";

export function MetricExportPanel({
  enabled,
  pending,
  failed,
}: {
  enabled: boolean;
  pending: boolean;
  failed: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="subscription-card" aria-label="Data & Privacy">
      <div className="entries-toolbar">
        <div>
          <h2>Data & Privacy</h2>
          <p className="settings-data-copy">
            Download your health records for your own analysis.
          </p>
        </div>
        {pending ? (
          <p role="status">Loading export availability…</p>
        ) : failed ? (
          <p role="alert">
            Export availability could not be checked. Reload to try again.
          </p>
        ) : enabled ? (
          <button
            type="button"
            className="metrics-secondary-action"
            onClick={() => setOpen(true)}
          >
            Export health data
          </button>
        ) : (
          <div className="export-upgrade">
            <span className="status-pill">Pro feature</span>
            <p>CSV export is included with Pro.</p>
            <a href="#available-plans">View plans →</a>
          </div>
        )}
      </div>
      {open && enabled ? (
        <MetricExportDialog onClose={() => setOpen(false)} />
      ) : null}
    </section>
  );
}

function MetricExportDialog({ onClose }: { onClose: () => void }) {
  const {
    data: definitions = [],
    isLoading,
    isError,
  } = useMetricDefinitionsQuery({ includeInactive: true });
  const [metric, setMetric] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccess(false);
    if (from && to && from > to) {
      setError("From date must be on or before To date.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await downloadMetricEntriesCsv({
        ...(metric ? { metric } : {}),
        ...(from
          ? { from: new Date(`${from}T00:00:00.000`).toISOString() }
          : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
      });
      setSuccess(true);
    } catch {
      setError("CSV export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal labelledBy="export-title" onClose={onClose} busy={busy}>
      <div className="metric-dialog-header">
        <h2 id="export-title">Export health data</h2>
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
        Choose a metric and date range. Leave dates blank to include your full
        history. Dates use your local time.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={busy} className="export-fields">
          <label>
            Metric
            <select
              value={metric}
              onChange={(event) => {
                setMetric(event.target.value);
                setSuccess(false);
              }}
            >
              <option value="">All metrics</option>
              {definitions.map((definition) => (
                <option key={definition.id} value={definition.slug}>
                  {definition.name}
                </option>
              ))}
            </select>
          </label>
          {isLoading ? <p role="status">Loading metrics…</p> : null}
          {isError ? (
            <p role="alert">
              Metric list could not load. You can still export all metrics.
            </p>
          ) : null}
          <div className="export-dates">
            <label>
              Export from
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setError("");
                  setSuccess(false);
                }}
              />
            </label>
            <label>
              Export to
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setError("");
                  setSuccess(false);
                }}
              />
            </label>
          </div>
        </fieldset>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status">CSV downloaded. Check your downloads folder.</p>
        ) : null}
        <div className="metric-dialog-actions">
          <button disabled={busy} type="submit">
            {busy ? "Exporting…" : "Export CSV"}
          </button>
          <button
            disabled={busy}
            className="metrics-secondary-action"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
