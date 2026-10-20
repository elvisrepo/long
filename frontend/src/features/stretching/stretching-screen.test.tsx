import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveCustomStretch,
  createCustomStretch,
  getStretchCatalog,
  getStretchEntries,
  getStretchPreferences,
  setStretchCheckoff,
  updateStretchPreferences,
  updateCustomStretch,
  type StretchPhase,
} from "./stretching-api";
import { StretchingScreen } from "./stretching-screen";

vi.mock("./stretching-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));

const phases: StretchPhase[] = [
  {
    slug: "lower-body" as const,
    name: "Lower body & hips",
    exercises: [
      {
        id: "lunge",
        slug: "lower-body-lunge-stretch",
        phase: "lower-body" as const,
        name: "Lunge Stretch",
        description: "Move the hip forward while keeping the lower back quiet.",
        dosage: "30 seconds per leg",
        display_order: 1,
        is_visible: true,
        is_custom: false,
        is_active: true,
        image_url: null,
      },
    ],
  },
  {
    slug: "upper-body" as const,
    name: "Upper body & posture",
    exercises: [
      {
        id: "neck",
        slug: "upper-body-chin-tuck",
        phase: "upper-body" as const,
        name: "Chin tuck",
        description:
          "Against a wall, gently draw the chin back with a small movement.",
        dosage: "10 reps",
        display_order: 1,
        is_visible: true,
        is_custom: false,
        is_active: true,
        image_url: null,
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
    vi.mocked(getStretchPreferences).mockResolvedValue({
      show_shared_exercises: true,
      hidden_exercise_ids: [],
    });
    vi.mocked(setStretchCheckoff).mockResolvedValue();
    vi.mocked(updateStretchPreferences).mockResolvedValue({
      show_shared_exercises: true,
      hidden_exercise_ids: [],
    });
    vi.mocked(createCustomStretch).mockResolvedValue({
      ...phases[0].exercises[0],
      id: "mine",
      name: "My stretch",
      slug: "",
      is_custom: true,
      image_url: null,
    });
    vi.mocked(updateCustomStretch).mockResolvedValue({
      ...phases[0].exercises[0],
      id: "mine",
      is_custom: true,
      image_url: null,
    });
    vi.mocked(archiveCustomStretch).mockResolvedValue();
  });

  it("shows seven-day records including archived stretches and selects a recorded day", async () => {
    const user = userEvent.setup();
    const recorded = [
      {
        id: 1,
        exercise_id: "lunge",
        performed_on: "2026-10-08",
        created_at: "2026-10-08T12:00:00Z",
      },
      {
        id: 2,
        exercise_id: "archived",
        performed_on: "2026-10-08",
        created_at: "2026-10-08T12:00:00Z",
      },
    ];
    vi.mocked(getStretchEntries).mockImplementation(async (from, to) =>
      recorded.filter((e) => e.performed_on >= from && e.performed_on <= to),
    );
    renderScreen();
    const history = await screen.findByRole("group", { name: "Last 7 days" });
    expect(getStretchEntries).toHaveBeenCalledWith("2026-10-03", "2026-10-09");
    await user.click(
      within(history).getByRole("button", {
        name: "2026-10-08: 2 stretches recorded",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Lunge Stretch" }),
      ).toBeChecked(),
    );
    expect(
      screen.getByText("2 stretches recorded · both phases"),
    ).toBeVisible();
    expect(
      screen.getByRole("tab", { name: /Lower body & hips/ }),
    ).toHaveTextContent("1 logged · 1 available");
    expect(screen.queryByText(/complete/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tracking date"), {
      target: { value: "2026-09-01" },
    });
    await waitFor(() =>
      expect(getStretchEntries).toHaveBeenCalledWith(
        "2026-09-01",
        "2026-09-01",
      ),
    );
    expect(
      within(history)
        .getAllByRole("button")
        .every((b) => b.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });

  it("refreshes daily and week counts after a confirmed save", async () => {
    const user = userEvent.setup();
    const records: {
      id: number;
      exercise_id: string;
      performed_on: string;
      created_at: string;
    }[] = [];
    vi.mocked(getStretchEntries).mockImplementation(async (from, to) =>
      records.filter((e) => e.performed_on >= from && e.performed_on <= to),
    );
    vi.mocked(setStretchCheckoff).mockImplementation(
      async (id, day, checked) => {
        if (checked)
          records.push({
            id: 1,
            exercise_id: id,
            performed_on: day,
            created_at: "2026-10-09T12:00:00Z",
          });
        else records.length = 0;
      },
    );
    renderScreen();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Lunge Stretch",
    });
    await user.click(checkbox);
    await waitFor(() =>
      expect(
        screen.getByText("1 stretch recorded · both phases"),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole("button", { name: "2026-10-09: 1 stretch recorded" }),
    ).toBeVisible();
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    await waitFor(() =>
      expect(
        screen.getByText("0 stretches recorded · both phases"),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole("button", { name: "2026-10-09: 0 stretches recorded" }),
    ).toBeVisible();
  });

  it("keeps daily logging usable if recent history fails and supports retry", async () => {
    const user = userEvent.setup();
    let failHistory = true;
    vi.mocked(getStretchEntries).mockImplementation(async (from, to) => {
      if (from !== to && failHistory) throw new Error("History unavailable");
      return [];
    });
    renderScreen();
    expect(
      await screen.findByRole("checkbox", { name: "Lunge Stretch" }),
    ).toBeEnabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Recent records could not be loaded",
    );
    expect(
      screen.queryByRole("button", { name: /2026-10-09: 0 stretches/ }),
    ).not.toBeInTheDocument();
    failHistory = false;
    await user.click(
      screen.getByRole("button", { name: "Retry recent records" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "2026-10-09: 0 stretches recorded",
      }),
    ).toBeVisible();
  });

  it("separates active custom stretches from archives and preserves restore and edit", async () => {
    const user = userEvent.setup();
    const custom = {
      ...phases[0].exercises[0],
      id: "mine",
      slug: "",
      name: "My stretch",
      is_custom: true,
    };
    const archived = {
      ...custom,
      id: "old",
      name: "Old stretch",
      is_active: false,
    };
    vi.mocked(getStretchCatalog).mockResolvedValue({
      phases: [
        { ...phases[0], exercises: [...phases[0].exercises, custom, archived] },
        phases[1],
      ],
    });
    renderScreen();
    await screen.findByRole("checkbox", { name: "Lunge Stretch" });
    await user.click(screen.getByRole("button", { name: "Manage stretches" }));
    const dialog = screen.getByRole("dialog", { name: "Manage stretches" });
    expect(within(dialog).queryByText("Old stretch")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("tab", { name: "Custom (1)" }));
    expect(within(dialog).getByText("My stretch")).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Archive My stretch" }),
    );
    await waitFor(() =>
      expect(archiveCustomStretch).toHaveBeenCalledWith("mine"),
    );
    await user.click(within(dialog).getByRole("tab", { name: "Archived (1)" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Restore Old stretch" }),
    );
    await waitFor(() =>
      expect(updateCustomStretch).toHaveBeenCalledWith(
        "old",
        expect.objectContaining({ is_active: true }),
      ),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Edit Old stretch" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit your stretch" }),
    ).toBeVisible();
  });

  it("starts a new custom stretch in the selected phase", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(
      await screen.findByRole("tab", { name: /Upper body & posture/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add custom stretch" }),
    );
    expect(screen.getByLabelText("Phase")).toHaveValue("upper-body");
    await user.type(screen.getByLabelText("Title"), "My upper stretch");
    await user.click(screen.getByRole("button", { name: "Save stretch" }));
    await waitFor(() =>
      expect(createCustomStretch).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "upper-body",
          name: "My upper stretch",
        }),
      ),
    );
  });

  it("creates a private stretch from the checklist toolbar", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("checkbox", { name: "Lunge Stretch" });
    await user.click(
      screen.getByRole("button", { name: "Add custom stretch" }),
    );
    await user.type(screen.getByLabelText("Title"), "My stretch");
    await user.click(screen.getByRole("button", { name: "Save stretch" }));
    await waitFor(() =>
      expect(createCustomStretch).toHaveBeenCalledWith({
        phase: "lower-body",
        name: "My stretch",
        description: "",
        dosage: "",
        image: null,
        remove_image: false,
      }),
    );
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
      screen.getByText("0 stretches recorded · both phases"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Upper body & posture/ }));
    expect(
      await screen.findByRole("checkbox", { name: /Chin tuck/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Enlarge illustration of Chin tuck",
      }),
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

  it("expands instructions without recording a stretch", async () => {
    const user = userEvent.setup();
    renderScreen();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Lunge Stretch",
    });
    const cue = screen.getByText(
      "Move the hip forward while keeping the lower back quiet.",
    );
    expect(cue).not.toBeVisible();
    await user.click(screen.getByText("Instructions"));
    expect(cue).toBeVisible();
    expect(checkbox).not.toBeChecked();
    expect(setStretchCheckoff).not.toHaveBeenCalled();
    expect(screen.getByText("30 seconds per leg")).toBeVisible();
  });

  it("opens an enlarged illustration without checking off the exercise", async () => {
    const user = userEvent.setup();
    renderScreen();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Lunge Stretch",
    });
    await user.click(
      screen.getByRole("button", {
        name: "Enlarge illustration of Lunge Stretch",
      }),
    );

    expect(screen.getByRole("dialog", { name: "Lunge Stretch" })).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Illustration of Lunge Stretch" }),
    ).toBeVisible();
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Close image" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(checkbox).not.toBeChecked();
  });

  it("lets the user hide built-ins individually or hide the whole shared catalog", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("checkbox", { name: "Lunge Stretch" });
    await user.click(screen.getByRole("button", { name: "Manage stretches" }));
    expect(
      screen.getByRole("dialog", { name: "Manage stretches" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Hide Lunge Stretch" }),
    );
    expect(updateStretchPreferences.mock.calls[0][0]).toEqual({
      hidden_exercise_ids: ["lunge"],
    });

    await user.click(
      screen.getByRole("checkbox", { name: "Show built-in stretches" }),
    );
    expect(updateStretchPreferences.mock.calls[1][0]).toEqual({
      show_shared_exercises: false,
    });
  });

  it("does not show a previous day's check-offs while a new date loads", async () => {
    let resolveNewDay: (() => void) | undefined;
    vi.mocked(getStretchEntries).mockImplementation((from, to) => {
      if (from !== to) return Promise.resolve([]);
      if (from === "2026-10-09")
        return Promise.resolve([
          {
            id: 1,
            exercise_id: "lunge",
            performed_on: from,
            created_at: "2026-10-09T12:00:00Z",
          },
        ]);
      return new Promise((resolve) => {
        resolveNewDay = () => resolve([]);
      });
    });

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
    expect(screen.getByText("Loading stretches…")).toBeInTheDocument();

    await act(async () => resolveNewDay?.());
  });

  it("clears a failed check-off message when changing dates", async () => {
    const user = userEvent.setup();
    vi.mocked(setStretchCheckoff).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );

    renderScreen();
    const lunge = await screen.findByRole("checkbox", {
      name: "Lunge Stretch",
    });
    await user.click(lunge);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network unavailable",
    );

    fireEvent.change(screen.getByLabelText("Tracking date"), {
      target: { value: "2026-10-10" },
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
