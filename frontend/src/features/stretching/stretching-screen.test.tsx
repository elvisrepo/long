import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        description: "",
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
        name: "Neck Mobility",
        description: "",
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
    expect(
      screen.getByText("0 of 1 checked for 2026-10-09"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Upper body & posture/ }));
    expect(
      await screen.findByRole("checkbox", { name: "Neck Mobility" }),
    ).toBeInTheDocument();
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
});
