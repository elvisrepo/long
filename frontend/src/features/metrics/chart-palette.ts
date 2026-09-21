// Canvas cannot resolve CSS variables; read their current values when drawing.
export function getChartPalette() {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(name).trim();
  return {
    line: color("--chart-line"),
    lineDim: color("--chart-line-dim"),
    fill: color("--chart-fill"),
    blue: color("--chart-blue"),
    blueFill: color("--chart-blue-fill"),
    grid: color("--chart-grid"),
    axis: color("--chart-axis"),
    text: color("--text-dim"),
    background: color("--dialog-bg"),
    foreground: color("--text"),
  };
}
