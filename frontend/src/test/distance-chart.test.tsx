import { distanceCalendarDates } from "../features/metrics/distance-calendar";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DistanceTrend } from "../features/metrics/distance-detail";
import { MetricTrendChart } from "../features/metrics/metric-trend-chart";
import type { MetricEntry } from "../features/metrics/metric-entries-api";

const chartConfig = vi.hoisted(() => vi.fn());
vi.mock("chart.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("chart.js")>();
  return {
    ...actual,
    Chart: class {
      static register() {}
      static getChart() {
        return undefined;
      }
      constructor(_context: unknown, config: unknown) {
        chartConfig(config);
      }
      destroy() {}
    },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  chartConfig.mockClear();
});

const entry: MetricEntry = {
  id: 1,
  metric_definition: "distance",
  value: 0,
  local_date: "2026-10-18",
  period_start: null,
  recorded_at: "2026-10-18T12:00:00Z",
  source: "health_connect",
  context: {},
  created_at: "2026-10-18T12:00:00Z",
};

describe("Distance daily presentation", () => {
  it("keeps local calendar dates across the autumn daylight-saving change", () => {
    expect(
      distanceCalendarDates(
        "2026-10-23T22:00:00Z",
        "2026-10-26T22:59:59Z",
        "Europe/Tirane",
      ),
    ).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("keeps a single linked UTC date despite the viewer's offset", () => {
    expect(
      distanceCalendarDates(
        "2026-10-17T00:00:00Z",
        "2026-10-17T23:59:59.999Z",
        "UTC",
      ),
    ).toEqual(["2026-10-17"]);
  });

  it("trims empty chart edges while preserving measured zero and internal gaps", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    render(
      <MetricTrendChart
        entries={[
          { ...entry, id: 2, local_date: "2026-10-20", value: 6 },
          entry,
        ]}
        metricName="Distance"
        metricSlug="distance"
        unit="km"
        calendarDates={[
          "2026-10-17",
          "2026-10-18",
          "2026-10-19",
          "2026-10-20",
          "2026-10-21",
        ]}
      />,
    );
    const config = chartConfig.mock.lastCall![0];
    expect(config.data.datasets[0].data).toEqual([0, null, 6]);
    expect(config.data.labels).toEqual(["Oct 18", "Oct 19", "Oct 20"]);
    expect(config.type).toBe("bar");
    expect(config.data.datasets[0].borderRadius).toBe(4);
    expect(config.data.datasets[0].minBarLength).toBe(2);
    expect(config.options.plugins.legend.display).toBe(false);
    expect(screen.queryByText("Daily latest values")).not.toBeInTheDocument();
  });

  it("does not show zero totals or an average when no days were recorded", () => {
    render(
      <DistanceTrend
        entries={[]}
        dates={["2026-10-20"]}
        timeZone="UTC"
        controls={null}
        loading={false}
        failed={false}
      />,
    );
    expect(screen.getByText("0 / 1")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("0 km")).not.toBeInTheDocument();
  });

  it("shows a daily fetch failure instead of fabricated zero coverage", () => {
    render(
      <DistanceTrend
        entries={[]}
        dates={["2026-10-20"]}
        timeZone="UTC"
        controls={null}
        loading={false}
        failed
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Daily distance failed to load",
    );
    expect(screen.queryByText("0 / 1")).not.toBeInTheDocument();
  });
});
