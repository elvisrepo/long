import type { AiReviewResult, ReviewPoint } from "./ai-insights-api";

export function AiWeeklyReview({ result }: { result: AiReviewResult }) {
  const days = result.snapshot.days ?? 7;
  function evidence(keys: string[]) {
    return (
      <details>
        <summary>Supporting numbers</summary>
        <ul>
          {keys.map((key) => {
            const row = result.snapshot.evidence[key];
            if (!row) return null;
            const format = (period: typeof row.current) =>
              period.observed_days !== undefined
                ? period.daily_average == null
                  ? "No measurements"
                  : `${period.daily_average.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.unit} · ${period.observed_days}/${days} ${days === 1 ? "day" : "days"}`
                : `${period.count ?? 0} logged · ${period.logged_days ?? 0}/${days} ${days === 1 ? "day" : "days"}`;
            return (
              <li key={key}>
                <strong>{row.label}:</strong> {format(row.current)}; previous:{" "}
                {format(row.previous)}
              </li>
            );
          })}
        </ul>
      </details>
    );
  }
  function paragraphs(text: string) {
    return text
      .split(/\n+/)
      .filter(Boolean)
      .map((paragraph, index) => <p key={index}>{paragraph}</p>);
  }
  function point(item: ReviewPoint, index: number) {
    return (
      <li key={index}>
        {paragraphs(item.text)}
        {evidence(item.evidence_keys)}
      </li>
    );
  }
  const review = result.review;
  const suggestions =
    "suggestions" in review
      ? review.suggestions
      : "priorities" in review
        ? review.priorities
        : [
            {
              text: review.suggestion,
              evidence_keys: [
                ...new Set(
                  review.observations.flatMap((item) => item.evidence_keys),
                ),
              ],
            },
          ];
  return (
    <div className="ai-weekly-review">
      <ol>{suggestions.map(point)}</ol>
    </div>
  );
}
