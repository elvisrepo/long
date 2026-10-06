import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RestTimer } from "./rest-timer";
import { createRef } from "react";
import type { RestTimerHandle } from "./rest-timer";

afterEach(() => vi.useRealTimers());
it("counts from a deadline and catches up after suspended browser ticks", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
  render(<RestTimer seconds={90} />);
  fireEvent.click(screen.getByText(/Rest timer ·/));
  fireEvent.click(screen.getByRole("button", { name: "Start rest" }));
  expect(screen.getByRole("timer")).toHaveTextContent("1:30");
  vi.setSystemTime(new Date("2026-10-02T10:02:00Z"));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole("timer")).toHaveTextContent("0:00");
  expect(screen.getByRole("status")).toHaveTextContent("Rest finished");
});

it("auto-starts only on an explicit confirmed completion event", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
  const ref = createRef<RestTimerHandle>();
  render(<RestTimer ref={ref} seconds={60} />);
  fireEvent.click(screen.getByText(/Rest timer ·/));
  act(() => ref.current?.completed());
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole("timer")).toHaveTextContent("1:00");
  fireEvent.click(screen.getByLabelText("Auto-start after completed set"));
  act(() => ref.current?.completed());
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole("timer")).toHaveTextContent("0:59");
  fireEvent.click(screen.getByRole("button", { name: "Stop rest" }));
  expect(screen.getByRole("timer")).toHaveTextContent("1:00");
});
