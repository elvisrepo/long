import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RestTimer } from "./rest-timer";
import { createRef } from "react";
import type { RestTimerHandle } from "./rest-timer";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "vibrate");
});
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

it("opens from a toolbar shortcut and keeps counting after its dialog closes", () => {
  vi.useFakeTimers();
  const ref = createRef<RestTimerHandle>();
  render(<RestTimer ref={ref} seconds={60} dialogMode />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  act(() => ref.current?.open());
  fireEvent.click(screen.getByRole("button", { name: "Start rest" }));
  fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
  act(() => vi.advanceTimersByTime(5000));
  act(() => ref.current?.open());
  expect(
    screen.getByRole("timer", { name: "Rest remaining" }),
  ).toHaveTextContent("0:55");
});

it("remembers a custom duration and keeps exercise defaults independent", () => {
  const props = { seconds: 60, context: "pullup" };
  const first = render(<RestTimer {...props} />);
  fireEvent.click(screen.getByText(/Rest timer ·/));
  fireEvent.click(screen.getByRole("button", { name: "Increase rest" }));
  expect(screen.getByLabelText("Rest seconds")).toHaveValue(65);
  first.unmount();
  const second = render(<RestTimer {...props} />);
  fireEvent.click(screen.getByText(/Rest timer ·/));
  expect(screen.getByLabelText("Rest seconds")).toHaveValue(65);
  second.rerender(<RestTimer seconds={180} context="deadlift" />);
  expect(screen.getByLabelText("Rest seconds")).toHaveValue(180);
  second.rerender(<RestTimer seconds={90} context="pullup" />);
  expect(screen.getByLabelText("Rest seconds")).toHaveValue(90);
});

it("alerts once at zero using the selected sound volume and vibration", () => {
  vi.useFakeTimers();
  const vibrate = vi.fn();
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  const oscillator = {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { value: 0 },
  };
  const gain = { connect: vi.fn(), gain: { value: 0 } };
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      destination = {};
      state = "running";
      createOscillator = () => oscillator;
      createGain = () => gain;
      resume = vi.fn().mockResolvedValue(undefined);
      close = close;
    },
  );
  const view = render(<RestTimer seconds={1} context="alerts" />);
  fireEvent.click(screen.getByText(/Rest timer ·/));
  fireEvent.change(screen.getByLabelText("Volume"), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start rest" }));
  act(() => vi.advanceTimersByTime(1500));
  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(oscillator.start).toHaveBeenCalledTimes(1);
  expect(gain.gain.value).toBeCloseTo(0.3);
  act(() => vi.advanceTimersByTime(3000));
  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(oscillator.start).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(close).toHaveBeenCalled();
});

it("does not alert after stopping or with both alerts turned off", () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "AudioContext",
    class {
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    },
  );
  const vibrate = vi.fn();
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  render(<RestTimer seconds={1} context="silent" />);
  fireEvent.click(screen.getByText(/Rest timer ·/));
  fireEvent.click(screen.getByLabelText("Sound"));
  fireEvent.click(screen.getByRole("button", { name: "Start rest" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop rest" }));
  act(() => vi.advanceTimersByTime(2000));
  expect(vibrate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Vibrate"));
  fireEvent.click(screen.getByRole("button", { name: "Start rest" }));
  act(() => vi.advanceTimersByTime(2000));
  expect(vibrate).not.toHaveBeenCalled();
});
