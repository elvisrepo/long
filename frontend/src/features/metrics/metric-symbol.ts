const metricSymbols: Record<string, string> = {
  steps: "↗",
  sleep_duration: "☾",
  body_weight: "◒",
  resting_hr: "♡",
  hrv: "♡",
  vo2_max: "◌",
};

export function metricSymbol(slug: string, name: string): string {
  return metricSymbols[slug] ?? name.slice(0, 1).toUpperCase();
}
