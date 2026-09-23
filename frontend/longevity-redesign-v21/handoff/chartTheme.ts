// longevity React port — src/features/metrics/chartTheme.ts
// Single place for chart colors. Reads the CSS vars from tokens-addition.css
// so charts follow rethemes without code changes.

function cssVar(name: string, fallback: string): string {
  if (typeof getComputedStyle === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function chartTheme() {
  return {
    line: cssVar("--chart-line", "#00e5a0"),
    fill: cssVar("--chart-fill", "rgba(0, 229, 160, 0.16)"),
    bar: cssVar("--chart-bar", "rgba(59, 130, 246, 0.65)"),
    grid: cssVar("--chart-grid", "rgba(133, 151, 176, 0.14)"),
    tick: cssVar("--chart-tick", "#8597b0"),
    pointBorder: "#07100d",
  };
}

// In metric-trend-chart.tsx, replace:
//   borderColor: "#00e5a0",
//   backgroundColor: "rgba(0, 229, 160, 0.16)",
//   pointBackgroundColor: "#00e5a0",
//   pointBorderColor: "#07100d",
// with:
//   const t = chartTheme();
//   borderColor: t.line,
//   backgroundColor: t.fill,
//   pointBackgroundColor: t.line,
//   pointBorderColor: t.pointBorder,
// and grid/ticks "rgba(133, 151, 176, ...)" → t.grid, "#8597b0" → t.tick.
