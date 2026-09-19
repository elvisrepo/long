const metricEntrySourceLabels: Record<string, string> = {
  manual: "Manual entry",
  samsung_health: "Samsung Health",
  garmin: "Garmin",
  fitbit: "Fitbit",
  oura: "Oura",
  withings: "Withings",
  csv_import: "CSV import",
};

export function formatMetricEntrySource(source: string): string {
  return metricEntrySourceLabels[source] ?? "Imported record";
}

export function formatSleepWindow(
  periodStart: string,
  recordedAt: string,
  timeZone?: string,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return `${formatter.format(new Date(periodStart))}–${formatter.format(new Date(recordedAt))}`;
}

export function formatSleepDate(recordedAt: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(recordedAt));
}

const metricMaximumFractionDigits: Record<string, number> = {
  body_weight: 1,
};

export function formatMetricValue(value: number, metricSlug: string): string {
  if (metricSlug === "sleep_duration") {
    const sign = value < 0 ? "-" : "";
    const totalMinutes = Math.round(Math.abs(value) * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${sign}${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  const maximumFractionDigits = metricMaximumFractionDigits[metricSlug];

  if (maximumFractionDigits === undefined) {
    return String(value);
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function formatMetricValueWithUnit(
  value: number,
  metricSlug: string,
  unit: string | undefined,
): string {
  const formattedValue = formatMetricValue(value, metricSlug);
  if (!unit || metricSlug === "sleep_duration") {
    return formattedValue;
  }
  return `${formattedValue} ${unit}`;
}
