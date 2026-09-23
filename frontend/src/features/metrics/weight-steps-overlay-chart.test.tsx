import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeightStepsOverlayChart } from "./weight-steps-overlay-chart";

describe("WeightStepsOverlayChart", () => {
  it("keeps calendar gaps and separates daily weight from its rolling average", () => {
    const chartMock = ChartMock.create;
    chartMock.mockClear();
    const getContextMock = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({} as CanvasRenderingContext2D);

    render(
      <WeightStepsOverlayChart
        series={[
          {
            date: "2026-09-18",
            weight_kg: 85,
            weight_7d_average_kg: 84.8,
            steps: 8000,
          },
          {
            date: "2026-09-19",
            weight_kg: null,
            weight_7d_average_kg: 84.8,
            steps: null,
          },
          {
            date: "2026-09-20",
            weight_kg: 84.6,
            weight_7d_average_kg: 84.7,
            steps: 9200,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /daily body weight, trailing seven-day mean, and daily total steps/i,
      }),
    ).toBeInTheDocument();
    expect(chartMock.mock.calls.at(-1)?.[0].data.labels).toEqual([
      "Sep 18",
      "Sep 19",
      "Sep 20",
    ]);
    expect(chartMock.mock.calls.at(-1)?.[0].data.datasets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Steps total",
          data: [8000, null, 9200],
        }),
        expect.objectContaining({
          label: "Daily weight kg",
          data: [85, null, 84.6],
          showLine: false,
        }),
        expect.objectContaining({
          label: "Trailing 7-day mean kg",
          data: [84.8, 84.8, 84.7],
          pointRadius: 3,
          tension: 0,
        }),
      ]),
    );

    getContextMock.mockRestore();
  });
});

class ChartMock {
  static create = vi.fn();
}

vi.mock("chart.js", () => {
  class Chart {
    static register = vi.fn();
    static getChart = vi.fn();

    constructor(_context: unknown, config: unknown) {
      ChartMock.create(config);
    }

    destroy = vi.fn();
  }

  return {
    BarController: vi.fn(),
    BarElement: vi.fn(),
    CategoryScale: vi.fn(),
    Chart,
    Legend: vi.fn(),
    LineController: vi.fn(),
    LineElement: vi.fn(),
    LinearScale: vi.fn(),
    PointElement: vi.fn(),
    Tooltip: vi.fn(),
  };
});
