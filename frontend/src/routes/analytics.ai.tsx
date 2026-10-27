import { useRef, useState } from "react";
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
  type InsightSnapshot,
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

import { AiReviewEvidence } from "../features/metrics/ai-review-evidence";
import {
  formatReviewRange,
  formatReviewGenerated,
  formatReviewExact,
} from "../features/metrics/ai-review-format";
import "../features/metrics/ai-insights.css";

function AiInsightsRoute() {
  const queryClient = useQueryClient();
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [newReviewOpen, setNewReviewOpen] = useState(false);
  const [consentFor, setConsentFor] = useState<{
    snapshot: InsightSnapshot;
    model: string | undefined;
  } | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const timeframe = Route.useSearch().timeframe ?? "week";
  const navigate = Route.useNavigate();
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
      setNewReviewOpen(false);
      setConsentFor(null);
      void queryClient.invalidateQueries({ queryKey: ["ai-insights-preview"] });
      requestAnimationFrame(() => reviewHeading.current?.focus());
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
  const hasSaved = !!displayedReview || history.length > 0;
  const model = selectedModel ?? preview.data?.model;
  const models =
    preview.data?.models ??
    (preview.data?.model
      ? [{ id: preview.data.model, label: preview.data.model }]
      : []);
  const snapshot = preview.data?.snapshot;
  const hasData =
    snapshot &&
    Object.values(snapshot.evidence).some(
      (row) => (row.current.observed_days ?? row.current.logged_days ?? 0) > 0,
    );
  const consent =
    !!snapshot &&
    consentFor?.snapshot === snapshot &&
    consentFor.model === model;
  const canGenerate =
    consent &&
    hasData &&
    preview.data?.available &&
    !generation.isPending &&
    !preview.isFetching &&
    !preview.isError;
  const status = preview.isError
    ? "Refresh the data preview before generating suggestions."
    : generation.isPending
      ? hasSaved
        ? "Saved review remains available below."
        : "Waiting for the provider…"
      : generation.error
        ? null
        : !preview.data?.available
          ? "AI generation is not configured yet. Review Provider settings to connect or check your key."
          : !hasData
            ? "No tracker data in the selected completed period yet."
            : preview.isFetching
              ? "Updating the data preview…"
              : null;
  return (
    <section className="ai-insights-screen ai-workspace">
      <PageHeader
        eyebrow="AI suggestions"
        title="AI Insights"
        breadcrumb={
          <Link className="metric-detail-breadcrumb" to="/">
            ← Dashboard
          </Link>
        }
      />
      <div className="ai-browse-controls">
        <label>
          Period
          <select
            aria-label="Data period"
            value={timeframe}
            disabled={generation.isPending}
            onChange={(event) => {
              void navigate({
                search: { timeframe: event.target.value as AiTimeframe },
                replace: true,
              });
              setSelectedReviewId(null);
              setConsentFor(null);
              generation.reset();
            }}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        {history.length > 0 && (
          <label>
            Saved reviews
            <select
              aria-label="Saved reviews"
              value={
                selectedReviewId ??
                (history.some((row) => row.id === displayedReview?.id)
                  ? displayedReview?.id
                  : "")
              }
              disabled={generation.isPending}
              onChange={(event) =>
                setSelectedReviewId(event.target.value || null)
              }
            >
              <option value="">Latest review</option>
              {history.map((row) => (
                <option key={row.id} value={row.id}>
                  {formatReviewRange({
                    from: row.period_start,
                    to: row.period_end,
                  })}{" "}
                  · {formatReviewGenerated(row.generated_at, row.timezone)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <AiApiKeySettings
        busy={generation.isPending}
        available={!!preview.data?.available}
        setupNeeded={!hasSaved && !!snapshot && !preview.data?.available}
      />
      {preview.isPending && (
        <p role="status">Preparing your tracker summary…</p>
      )}
      {preview.error && (
        <div role="alert" className="settings-inline-error">
          {preview.error.message}
          <button onClick={() => void preview.refetch()}>Retry preview</button>
        </div>
      )}
      {savedReview.isFetching && <p role="status">Loading saved review…</p>}
      {savedReview.error && (
        <div role="alert">
          {savedReview.error.message}
          <button onClick={() => void savedReview.refetch()}>
            Retry saved review
          </button>
        </div>
      )}
      {snapshot && (
        <details
          className="ai-new-review"
          aria-label="Generate a new review"
          open={newReviewOpen || !hasSaved}
          onToggle={(event) => {
            if (hasSaved) setNewReviewOpen(event.currentTarget.open);
          }}
        >
          <summary>New review</summary>
          <section
            aria-label="Generate suggestions"
            className="ai-generation-content"
          >
            <header>
              <h2>{formatReviewRange(snapshot.period)}</h2>
              <p className="ai-help">
                vs {formatReviewRange(snapshot.previous_period)}
              </p>
            </header>
            {models.length > 0 && (
              <label className="ai-generation-model">
                Model
                <select
                  aria-label="Review model"
                  value={model ?? ""}
                  disabled={generation.isPending}
                  onChange={(event) => {
                    setSelectedModel(event.target.value);
                    setConsentFor(null);
                  }}
                >
                  {models.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <details className="ai-review-metadata">
              <summary>Model details</summary>
              <p>Model: {model ?? "Not configured"}</p>
              <p>
                {snapshot.days ?? 7} completed days · {snapshot.timezone}. Usage
                depends on your provider account.
              </p>
            </details>
            <details className="ai-data-disclosure">
              <summary>Data to share</summary>
              <AiReviewEvidence
                snapshot={snapshot}
                label="Data to share for a new review"
              />
            </details>
            <label className="ai-sharing-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={generation.isPending || preview.isFetching}
                onChange={(event) =>
                  setConsentFor(
                    event.target.checked ? { snapshot, model } : null,
                  )
                }
              />
              <span>Share this data with NVIDIA.</span>
            </label>
            <p className="ai-help">
              Food/routine names included; profile, notes and images excluded.
            </p>
            <div className="ai-generate-actions">
              <button
                aria-label={
                  generation.isPending
                    ? "Generating your suggestions…"
                    : "Generate suggestions"
                }
                disabled={!canGenerate}
                onClick={() => generation.mutate(model)}
              >
                {generation.isPending ? "Generating…" : "Generate"}
              </button>
              {status && (
                <p role="status" className="ai-help">
                  {status}
                </p>
              )}
            </div>
            {generation.error && (
              <p role="alert" className="form-error">
                {generation.error.message}
              </p>
            )}
          </section>
        </details>
      )}

      {displayedReview && (
        <section
          className="ai-result-card"
          aria-label="Your AI suggestions"
          aria-live="polite"
        >
          <header className="ai-result-header">
            <div>
              <h2 ref={reviewHeading} tabIndex={-1}>
                {displayedReview.snapshot.timeframe === "day"
                  ? "Daily"
                  : displayedReview.snapshot.timeframe === "month"
                    ? "Monthly"
                    : "Weekly"}{" "}
                suggestions
              </h2>
              <p className="ai-result-period">
                {formatReviewRange(displayedReview.snapshot.period)}
              </p>
            </div>
            <details className="ai-review-metadata">
              <summary>Review details</summary>
              <p>
                Based on data: {displayedReview.snapshot.period.from} –{" "}
                {displayedReview.snapshot.period.to} ·{" "}
                {displayedReview.snapshot.timezone}
              </p>
              <p>
                Generated{" "}
                {formatReviewExact(
                  displayedReview.generated_at,
                  displayedReview.snapshot.timezone,
                )}{" "}
                · {displayedReview.snapshot.timezone}
                {displayedReview.model ? ` · ${displayedReview.model}` : ""}
              </p>
              <p>
                This review does not diagnose conditions or establish causes.
              </p>
            </details>
          </header>
          <AiWeeklyReview result={displayedReview} />
          <details className="ai-data-disclosure">
            <summary>Data used in this saved review</summary>
            <AiReviewEvidence
              snapshot={displayedReview.snapshot}
              label="Data used in this saved review"
            />
          </details>
          <p className="ai-help">
            AI suggestions can be wrong. Check the evidence.
          </p>
        </section>
      )}
    </section>
  );
}
