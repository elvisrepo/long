import { getAccessToken } from "../auth/auth-session";

export interface InsightEvidence {
  label: string;
  unit: string;
  current: {
    observed_days?: number;
    daily_average?: number | null;
    logged_days?: number;
    count?: number;
  };
  previous: InsightEvidence["current"];
  change?: number | null;
  series: { date: string; value: number | null }[];
}

export type AiTimeframe = "day" | "week" | "month";

export interface InsightSnapshot {
  timeframe?: AiTimeframe;
  days?: number;
  timezone: string;
  period: { from: string; to: string };
  previous_period: { from: string; to: string };
  evidence: Record<string, InsightEvidence>;
}

export interface AiReviewResult {
  id?: string;
  model?: string;
  snapshot: InsightSnapshot;
  generated_at: string;
  review:
    | { suggestions: ReviewPoint[] }
    | ComprehensiveReview
    | {
        observations: { text: string; evidence_keys: string[] }[];
        suggestion: string;
      };
}

export interface ReviewPoint {
  text: string;
  evidence_keys: string[];
}
export interface ComprehensiveReview {
  overview: string;
  sections: (ReviewPoint & { key: string })[];
  connections: ReviewPoint[];
  priorities: ReviewPoint[];
}

async function aiRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error("Authentication required");
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    let message = "AI insights could not be loaded. Please try again.";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.api_key))
        message = "Enter a valid NVIDIA API key starting with nvapi-.";
    } catch {
      /* Keep a safe fallback for non-JSON responses. */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export interface SavedReviewSummary {
  timeframe?: AiTimeframe;
  id: string;
  model: string;
  generated_at: string;
  timezone: string;
  period_start: string;
  period_end: string;
}

export function getSavedAiReview(reviewId: string) {
  return aiRequest<{ status: string; result: AiReviewResult }>(
    `/api/v1/metrics/analytics/ai-weekly/?review_id=${encodeURIComponent(reviewId)}`,
  );
}

export function getAiPreview(
  timezone: string,
  timeframe: AiTimeframe = "week",
) {
  return aiRequest<{
    available: boolean;
    model?: string;
    models?: { id: string; label: string }[];
    latest_review?: AiReviewResult | null;
    review_history?: SavedReviewSummary[];
    snapshot: InsightSnapshot;
  }>(
    `/api/v1/metrics/analytics/ai-weekly/?timezone=${encodeURIComponent(timezone)}&timeframe=${timeframe}`,
  );
}

export async function generateAiReview(
  timezone: string,
  model?: string,
  timeframe: AiTimeframe = "week",
): Promise<AiReviewResult> {
  const started = await aiRequest<{ job_id: string }>(
    "/api/v1/metrics/analytics/ai-weekly/",
    {
      method: "POST",
      body: JSON.stringify({
        timezone,
        consent: true,
        timeframe,
        ...(model ? { model } : {}),
      }),
    },
  );
  for (let attempt = 0; attempt < 1800; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // Logout cancels further polling through aiRequest's token check.
    const job = await aiRequest<{
      status: string;
      detail?: string;
      result?: AiReviewResult;
    }>(
      `/api/v1/metrics/analytics/ai-weekly/?timezone=${encodeURIComponent(timezone)}&job_id=${encodeURIComponent(started.job_id)}`,
    );
    if (job.status === "ready" && job.result) return job.result;
    if (job.status === "failed" || job.status === "expired")
      throw new Error(
        job.detail ?? "AI review could not be generated. Try again later.",
      );
  }
  throw new Error("Your review took too long. Please try again later.");
}

export function getPersonalAiKey() {
  return aiRequest<{ has_personal_key: boolean }>(
    "/api/v1/metrics/analytics/ai-key/",
  );
}

export function savePersonalAiKey(apiKey: string) {
  return aiRequest<{ has_personal_key: boolean }>(
    "/api/v1/metrics/analytics/ai-key/",
    { method: "PUT", body: JSON.stringify({ api_key: apiKey }) },
  );
}

export function removePersonalAiKey() {
  return aiRequest<{ has_personal_key: boolean }>(
    "/api/v1/metrics/analytics/ai-key/",
    { method: "DELETE" },
  );
}
