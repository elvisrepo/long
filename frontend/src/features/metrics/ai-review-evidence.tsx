import type { InsightSnapshot } from "./ai-insights-api";
import { formatEvidencePeriod, formatReviewRange } from "./ai-review-format";

export function AiReviewEvidence({
  snapshot,
  label,
}: {
  snapshot: InsightSnapshot;
  label: string;
}) {
  return (
    <div className="ai-review-evidence">
      <p className="ai-help">
        Averages exclude missing measurements. Check-offs count logs, not
        nutrients or effects. Skin temperature is relative to its source
        baseline.
      </p>
      <table aria-label={label}>
        <caption>
          Data: {snapshot.period.from} – {snapshot.period.to}; compared with{" "}
          {snapshot.previous_period.from} – {snapshot.previous_period.to} ·{" "}
          {snapshot.timezone}
        </caption>
        <thead>
          <tr>
            <th scope="col">Tracker</th>
            <th scope="col">Selected period</th>
            <th scope="col">Previous period</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(snapshot.evidence).map(([key, row]) => (
            <tr key={key}>
              <th scope="row">{row.label}</th>
              <td>
                <span className="ai-evidence-label" aria-hidden="true">
                  Selected period
                </span>
                {formatEvidencePeriod(
                  row.current,
                  row.unit,
                  snapshot.days ?? 7,
                )}
              </td>
              <td>
                <span className="ai-evidence-label" aria-hidden="true">
                  Previous period
                </span>
                {formatEvidencePeriod(
                  row.previous,
                  row.unit,
                  snapshot.days ?? 7,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="ai-exact-data">
        <summary>
          Exact daily summaries · {formatReviewRange(snapshot.period)}
        </summary>
        <pre>{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </div>
  );
}
