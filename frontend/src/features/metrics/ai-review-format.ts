import type { InsightEvidence, InsightSnapshot } from "./ai-insights-api";

export function formatReviewRange(period: InsightSnapshot["period"]): string {
  const from = new Date(`${period.from}T12:00:00Z`),
    to = new Date(`${period.to}T12:00:00Z`);
  const date = (value: Date, year = false) =>
    value.toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      ...(year ? { year: "numeric" as const } : {}),
    });
  if (period.from === period.to) return date(from, true);
  if (from.getUTCFullYear() !== to.getUTCFullYear())
    return `${date(from, true)} – ${date(to, true)}`;
  const start =
    from.getUTCMonth() === to.getUTCMonth()
      ? String(from.getUTCDate())
      : date(from);
  return `${start}–${date(to, true)}`;
}
export function formatReviewGenerated(
  timestamp: string,
  timezone: string,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}
export function formatReviewExact(timestamp: string, timezone: string): string {
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
export function formatEvidencePeriod(
  period: InsightEvidence["current"],
  unit: string,
  days: number,
): string {
  if (period.observed_days !== undefined)
    return period.daily_average == null
      ? "No measurements"
      : `${period.daily_average.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit} · ${period.observed_days}/${days} ${days === 1 ? "day" : "days"}`;
  return `${period.count ?? 0} logged · ${period.logged_days ?? 0}/${days} ${days === 1 ? "day" : "days"}`;
}
