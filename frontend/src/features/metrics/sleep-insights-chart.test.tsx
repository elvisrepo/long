import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { SleepInsightsChart } from "./sleep-insights-chart";

it("uses the shared chart surface while preserving target and duration labels", () => {
  render(
    <SleepInsightsChart
      targetMinutes={450}
      series={[
        { date: "2026-10-05", duration_minutes: 420 },
        { date: "2026-10-06", duration_minutes: null },
      ]}
    />,
  );

  const chart = screen.getByRole("img", { name: /nightly sleep durations/i });
  expect(chart).toHaveClass("chart-surface");
  expect(screen.getByText("7h 00m")).toBeInTheDocument();
  expect(screen.getByText("target")).toBeInTheDocument();
  expect(screen.getByTitle("No sleep record")).toBeInTheDocument();
});
