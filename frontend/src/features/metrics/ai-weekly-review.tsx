import type { AiReviewResult, ReviewPoint } from "./ai-insights-api";
import { formatEvidencePeriod } from "./ai-review-format";

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
            return (
              <li key={key}>
                <strong>{row.label}</strong>
                <dl className="ai-support-comparison">
                  <div>
                    <dt>Selected period</dt>
                    <dd>{formatEvidencePeriod(row.current, row.unit, days)}</dd>
                  </div>
                  <div>
                    <dt>Previous period</dt>
                    <dd>
                      {formatEvidencePeriod(row.previous, row.unit, days)}
                    </dd>
                  </div>
                </dl>
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
        <h3>Suggestion {index + 1}</h3>
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
      <ol role="list">{suggestions.map(point)}</ol>
    </div>
  );
}
