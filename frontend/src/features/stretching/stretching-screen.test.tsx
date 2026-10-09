import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStretchCatalog,
  getStretchEntries,
  setStretchCheckoff,
} from "./stretching-api";
import { StretchingScreen } from "./stretching-screen";

vi.mock("./stretching-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));

const phases = [
  {
    slug: "lower-body" as const,
    name: "Lower body & hips",
    exercises: [
      {
        id: "lunge",
        slug: "lunge",
        phase: "lower-body" as const,
        name: "Lunge Stretch",
        description: "Move the hip forward while keeping the lower back quiet.",
        dosage: "30 seconds per leg",
        display_order: 1,
      },
    ],
  },
  {
    slug: "upper-body" as const,
    name: "Upper body & posture",
    exercises: [
      {
        id: "neck",
        slug: "neck",
        phase: "upper-body" as const,
        name: "Chin tuck",
        description:
          "Against a wall, gently draw the chin back with a small movement.",
        dosage: "10 reps",
        display_order: 1,
      },
    ],
  },
];

function renderScreen() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <StretchingScreen />
    </QueryClientProvider>,
  );
}

describe("StretchingScreen", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-10-09T12:00:00"));
    vi.resetAllMocks();
    vi.mocked(getStretchCatalog).mockResolvedValue({ phases });
    vi.mocked(getStretchEntries).mockResolvedValue([]);
    vi.mocked(setStretchCheckoff).mockResolvedValue();
  });

  it("switches phases and saves a selected day's exercise check-off", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("checkbox", { name: "Lunge Stretch" });
    expect(screen.getByText("30 seconds per leg")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Move the hip forward while keeping the lower back quiet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("0 of 1 checked for 2026-10-09"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Upper body & posture/ }));
    expect(
      await screen.findByRole("checkbox", { name: /Chin tuck/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("10 reps")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Lower body & hips/ }));
    const lunge = await screen.findByRole("checkbox", {
      name: "Lunge Stretch",
    });
    await waitFor(() => expect(lunge).toBeEnabled());
    await user.click(lunge);
    expect(setStretchCheckoff).toHaveBeenCalledWith(
      "lunge",
      "2026-10-09",
      true,
    );
  });

  it("does not show a previous day's check-offs while a new date loads", async () => {
    let resolveNewDay: (() => void) | undefined;
    vi.mocked(getStretchEntries)
      .mockResolvedValueOnce([
        {
          id: 1,
          exercise_id: "lunge",
          performed_on: "2026-10-09",
          created_at: "2026-10-09T12:00:00Z",
        },
      ])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewDay = () => resolve([]);
          }),
      );

    renderScreen();
    const lunge = await screen.findByRole("checkbox", {
      name: "Lunge Stretch",
    });
    expect(lunge).toBeChecked();

    fireEvent.change(screen.getByLabelText("Tracking date"), {
      target: { value: "2026-10-10" },
    });

    await waitFor(() =>
      expect(getStretchEntries).toHaveBeenCalledWith(
        "2026-10-10",
        "2026-10-10",
      ),
    );
    expect(lunge).not.toBeChecked();
    expect(
      screen.getByText("0 of 1 checked for 2026-10-10"),
    ).toBeInTheDocument();

    await act(async () => resolveNewDay?.());
  });
});
