import { getAccessToken } from "../auth/auth-session";

export interface MetricEntryExportFilters {
  metric?: string;
  from?: string;
  to?: string;
}

export async function downloadMetricEntriesCsv(
  filters: MetricEntryExportFilters = {},
): Promise<void> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const searchParams = new URLSearchParams();
  if (filters.metric) {
    searchParams.set("metric", filters.metric);
  }
  if (filters.from) {
    searchParams.set("from", filters.from);
  }
  if (filters.to) {
    searchParams.set("to", filters.to);
  }

  const queryString = searchParams.toString();
  const url = queryString
    ? `/api/v1/metrics/entries/export/?${queryString}`
    : "/api/v1/metrics/entries/export/";
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Metric entries failed to export");
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "longevity-metrics.csv";
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
