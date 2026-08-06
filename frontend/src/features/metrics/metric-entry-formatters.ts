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
