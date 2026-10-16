import type { EstimatedBmr } from "./personal-info-api";
import { formatMetricEntrySource } from "../metrics/metric-entry-formatters";

export function EstimatedBmrSummary({ estimate }: { estimate: EstimatedBmr }) {
  return (
    <>
      <div className="metric-current-value">
        <span>
          {estimate.value === null
            ? "—"
            : new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(
                estimate.value,
              )}
        </span>
        <small>kcal/day</small>
      </div>
      <p className="metric-meta">Mifflin–St Jeor · resting energy estimate</p>
      {estimate.weight ? (
        <p className="metric-meta">
          Using{" "}
          {estimate.weight.value.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}{" "}
          kg · {new Date(estimate.weight.recorded_at).toLocaleDateString()} ·{" "}
          {formatMetricEntrySource(estimate.weight.source)}
        </p>
      ) : null}
      {estimate.reason === "missing_information" ? (
        <p className="metric-meta">
          {estimate.missing_fields.includes("body_weight") ? (
            <>
              <a href="/metrics/body_weight">Log body weight</a>.{" "}
            </>
          ) : null}
          {estimate.missing_fields.some((field) => field !== "body_weight") ? (
            <>
              Complete personal info in{" "}
              <a href="/settings#personal-info">Settings</a>.
            </>
          ) : null}
        </p>
      ) : null}
      {estimate.reason === "adult_only" ? (
        <p className="metric-meta">
          This estimate is available for adults aged 18 and over.
        </p>
      ) : null}
      {estimate.reason === "invalid_weight" ||
      estimate.reason === "invalid_inputs" ? (
        <p className="metric-meta">
          Check your latest weight and personal info to calculate an estimate.
        </p>
      ) : null}
    </>
  );
}
