const metricEntrySourceLabels: Record<string, string> = {
  manual: 'Manual entry',
  samsung_health: 'Samsung Health',
  garmin: 'Garmin',
  fitbit: 'Fitbit',
  oura: 'Oura',
  withings: 'Withings',
  csv_import: 'CSV import',
}

export function formatMetricEntrySource(source: string): string {
  return metricEntrySourceLabels[source] ?? 'Imported record'
}

const metricMaximumFractionDigits: Record<string, number> = {
  body_weight: 1,
}

export function formatMetricValue(value: number, metricSlug: string): string {
  const maximumFractionDigits = metricMaximumFractionDigits[metricSlug]

  if (maximumFractionDigits === undefined) {
    return String(value)
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value)
}
