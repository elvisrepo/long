import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../components/page-header";
import { AiWeeklyReview } from "../features/metrics/ai-weekly-review";
import { AiApiKeySettings } from "../features/metrics/ai-api-key-settings";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import {
  getAiPreview,
  getSavedAiReview,
  generateAiReview,
  type InsightEvidence,
  type AiTimeframe,
} from "../features/metrics/ai-insights-api";

export const Route = createFileRoute("/analytics/ai")({
  beforeLoad: requireAuthBeforeLoad,
  validateSearch: (
    search: Record<string, unknown>,
  ): { timeframe?: AiTimeframe } => ({
    timeframe:
      search.timeframe === "day" ||
      search.timeframe === "week" ||
      search.timeframe === "month"
        ? search.timeframe
        : undefined,
  }),
  component: AiInsightsRoute,
});

function formatGeneratedAt(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatPeriod(
  period: InsightEvidence["current"],
  unit: string,
  days: number,
): string {
  if (period.observed_days !== undefined) {
    return period.daily_average == null
      ? "No measurements"
      : `${period.daily_average.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit} · ${period.observed_days}/${days} ${days === 1 ? "day" : "days"}`;
  }
  return `${period.count ?? 0} logged · ${period.logged_days ?? 0}/${days} ${days === 1 ? "day" : "days"}`;
}

function AiInsightsRoute() {
  const queryClient = useQueryClient();
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const timeframe = Route.useSearch().timeframe ?? "week";
  const navigate = Route.useNavigate();
  const [consent, setConsent] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const preview = useQuery({
    queryKey: ["ai-insights-preview", timezone, timeframe],
    queryFn: () => getAiPreview(timezone, timeframe),
  });
  const generation = useMutation({
    mutationFn: (model: string | undefined) =>
      generateAiReview(timezone, model, timeframe),
    retry: false,
    onSuccess: () => {
      setSelectedReviewId(null);
      void queryClient.invalidateQueries({ queryKey: ["ai-insights-preview"] });
    },
  });
  const savedReview = useQuery({
    queryKey: ["ai-saved-review", selectedReviewId],
    queryFn: () => getSavedAiReview(selectedReviewId!),
    enabled: selectedReviewId !== null,
  });
  const displayedReview = selectedReviewId
    ? savedReview.data?.result
    : (generation.data ?? preview.data?.latest_review);
  const history = preview.data?.review_history ?? [];
  const model = selectedModel ?? preview.data?.model;
  const models =
    preview.data?.models ??
    (preview.data?.model
      ? [{ id: preview.data.model, label: preview.data.model }]
      : []);
  const snapshot = preview.data?.snapshot;
  const summarySnapshot = displayedReview?.snapshot ?? snapshot;
  const hasData =
    snapshot &&
    Object.values(snapshot.evidence).some(
      (row) => (row.current.observed_days ?? row.current.logged_days ?? 0) > 0,
    );

  return (
    <section className="sleep-insights-screen ai-insights-screen">
      <PageHeader
        title="AI Insights"
        eyebrow="Pro Insights · AI suggestions"
        breadcrumb={
          <Link className="metric-detail-breadcrumb" to="/">
            ← Dashboard
          </Link>
        }
        description={
          <p>
            Choose a day, week or month of completed tracker data for three
            practical suggestions, with the preceding period for comparison.
          </p>
        }
      />
      <AiApiKeySettings busy={generation.isPending} />
      <div className="ai-review-controls">
        {models.length ? (
          <div className="ai-model-picker">
            <label htmlFor="review-model">Review model</label>
            <select
              id="review-model"
              value={model ?? ""}
              disabled={generation.isPending}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {models.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p>Model: {model}</p>
            <p>Availability and usage limits depend on your NVIDIA account.</p>
          </div>
        ) : null}
        <div className="ai-model-picker">
          <label htmlFor="review-timeframe">Data period</label>
          <select
            id="review-timeframe"
            value={timeframe}
            disabled={generation.isPending}
            onChange={(event) => {
              void navigate({
                search: { timeframe: event.target.value as AiTimeframe },
                replace: true,
              });
              setSelectedReviewId(null);
              setConsent(false);
              generation.reset();
            }}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
          <p>
            {timeframe === "day"
              ? "Yesterday, compared with the day before."
              : timeframe === "week"
                ? "Last 7 completed days, compared with the preceding 7."
                : "Last 30 completed days, compared with the preceding 30."}
          </p>
        </div>
      </div>
      {preview.isPending ? (
        <p role="status">Preparing your tracker summary…</p>
      ) : null}
      {preview.error ? (
        <div role="alert" className="settings-inline-error">
          {preview.error.message}
          <button type="button" onClick={() => void preview.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {snapshot && summarySnapshot ? (
        <>
          <section
            className="sleep-insights-card"
            aria-label="Generate suggestions"
          >
            <h2>
              {snapshot.period.from} – {snapshot.period.to}
            </h2>
            <p>
              Compared with {snapshot.previous_period.from} –{" "}
              {snapshot.previous_period.to} · {snapshot.timezone}
            </p>
            <p>
              Sleep, activity, overnight metrics, weight, workouts, diet,
              recovery and stretching—where you have recorded data.
            </p>
            {!preview.data?.available ? (
              <p role="status">
                AI generation is not configured yet. You can review your actual
                tracker summary below.
              </p>
            ) : null}
            {!hasData ? (
              <p>No tracker data in the selected completed period yet.</p>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={consent}
                disabled={generation.isPending}
                onChange={(event) => setConsent(event.target.checked)}
              />{" "}
              Share these tracker summaries with NVIDIA to generate suggestions
              for the selected period.
            </label>
            <p>
              Includes logged food and routine names. Profile fields, personal
              notes and images are excluded.
            </p>
            <button
              type="button"
              disabled={
                !consent ||
                !hasData ||
                !preview.data?.available ||
                generation.isPending
              }
              onClick={() => generation.mutate(model)}
            >
              {generation.isPending
                ? "Generating your suggestions…"
                : "Generate suggestions"}
            </button>
            {generation.isPending ? (
              <p role="status">Finding useful actions from your trackers…</p>
            ) : null}
            {generation.error ? (
              <p role="alert" className="form-error">
                {generation.error.message}
              </p>
            ) : null}
          </section>
          {history.length ? (
            <div className="ai-model-picker">
              <label htmlFor="saved-review">Saved reviews</label>
              <select
                id="saved-review"
                value={selectedReviewId ?? displayedReview?.id ?? ""}
                onChange={(event) =>
                  setSelectedReviewId(event.target.value || null)
                }
              >
                {!displayedReview?.id ? (
                  <option value="">Latest review</option>
                ) : null}
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.period_start} – {item.period_end} · {item.model} ·
                    Generated:{" "}
                    {formatGeneratedAt(item.generated_at, item.timezone)} ·{" "}
                    {item.timezone}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {savedReview.isFetching ? (
            <p role="status">Loading saved review…</p>
          ) : null}
          {savedReview.error ? (
            <p role="alert">{savedReview.error.message}</p>
          ) : null}
          {displayedReview ? (
            <section
              className="sleep-insights-card"
              aria-label="Your AI suggestions"
              aria-live="polite"
            >
              <h2>
                {displayedReview.snapshot.timeframe === "day"
                  ? "Daily"
                  : displayedReview.snapshot.timeframe === "month"
                    ? "Monthly"
                    : "Weekly"}{" "}
                suggestions
              </h2>
              <p>
                Based on data: {displayedReview.snapshot.period.from} –{" "}
                {displayedReview.snapshot.period.to} ·{" "}
                {displayedReview.snapshot.timezone}
              </p>
              <p>
                Generated{" "}
                {formatGeneratedAt(
                  displayedReview.generated_at,
                  displayedReview.snapshot.timezone,
                )}{" "}
                · {displayedReview.snapshot.timezone}
                {displayedReview.model ? ` · ${displayedReview.model}` : ""}
              </p>
              <AiWeeklyReview result={displayedReview} />
              <p>
                AI can misinterpret patterns. Check the supporting numbers. This
                review does not diagnose conditions or establish causes.
              </p>
            </section>
          ) : null}
          <section
            className="sleep-insights-card"
            aria-label="Tracker summary shared with AI"
          >
            <h2>Your tracker summary</h2>
            <p>
              Measurement values are averages of the available daily summaries.
              Missing measurements are excluded, not counted as zero. Check-offs
              show logged activity, not nutrient intake or treatment effects.
              Skin temperature values are changes from the source baseline.
            </p>
            <div style={{ overflowX: "auto", maxWidth: "100%" }}>
              <table>
                <caption>
                  Data: {summarySnapshot.period.from} –{" "}
                  {summarySnapshot.period.to}; compared with{" "}
                  {summarySnapshot.previous_period.from} –{" "}
                  {summarySnapshot.previous_period.to} ·{" "}
                  {summarySnapshot.timezone}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Tracker</th>
                    <th scope="col">Selected period</th>
                    <th scope="col">Previous period</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summarySnapshot.evidence).map(
                    ([key, row]) => (
                      <tr key={key}>
                        <th scope="row">{row.label}</th>
                        <td>
                          {formatPeriod(
                            row.current,
                            row.unit,
                            summarySnapshot.days ?? 7,
                          )}
                        </td>
                        <td>
                          {formatPeriod(
                            row.previous,
                            row.unit,
                            summarySnapshot.days ?? 7,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <details>
              <summary>View exact daily summaries sent to AI</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(summarySnapshot, null, 2)}
              </pre>
            </details>
          </section>
        </>
      ) : null}
    </section>
  );
}
