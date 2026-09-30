import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRecoveryTool,
  getRecoveryEntries,
  getRecoveryTools,
  setRecoveryCheckoff,
  updateRecoveryTool,
} from "./recovery-api";
import type { RecoveryTool } from "./recovery-api";
import { RecoveryScreen } from "./recovery-screen";

vi.mock("./recovery-api");
vi.mock("../auth/use-me-query", () => ({
  useMeQuery: () => ({ data: { email: "owner@example.com" } }),
}));

const massage = {
  id: "massage-id",
  name: "Massage",
  description: "Post-exercise massage.",
  is_active: true,
  is_custom: false,
  evidence: {
    outcome: "doms",
    smd: -2.26,
    ci_lower: -3.05,
    ci_upper: -1.47,
    subjects: 158,
    experimental_groups: 14,
    citation: "Dupuy et al. (2018), Table 1",
    source_url:
      "https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00403/full",
  },
};

function renderRecovery() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RecoveryScreen />
    </QueryClientProvider>,
  );
}

describe("Recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getRecoveryTools).mockResolvedValue({
      tools: [massage],
      can_create_custom: false,
    });
    vi.mocked(getRecoveryEntries).mockResolvedValue([]);
  });

  it("shows soreness evidence, the source and Free custom-tool restriction", async () => {
    renderRecovery();
    expect(
      await screen.findByRole("checkbox", { name: "Massage" }),
    ).not.toBeChecked();
    expect(screen.getByText(/SMD −2.26/)).toBeInTheDocument();
    expect(screen.getByText(/95% CI −3.05 to −1.47/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dupuy/ })).toHaveAttribute(
      "href",
      massage.evidence.source_url,
    );
    expect(
      screen.getByText(/Pro is required to add custom/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add tool" }),
    ).not.toBeInTheDocument();
  });

  it("saves and undoes the selected day's check-off", async () => {
    const user = userEvent.setup();
    let done = false;
    vi.mocked(getRecoveryEntries).mockImplementation(async (_from, to) =>
      done
        ? [
            {
              id: 1,
              tool_id: massage.id,
              performed_on: to,
              created_at: "2026-09-30T10:00:00Z",
            },
          ]
        : [],
    );
    vi.mocked(setRecoveryCheckoff).mockImplementation(
      async (_tool, _day, checked) => {
        done = checked;
      },
    );
    renderRecovery();
    const checkbox = await screen.findByRole("checkbox", { name: "Massage" });
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(screen.getByText(/1 activity recorded/)).toBeInTheDocument();
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(setRecoveryCheckoff).toHaveBeenLastCalledWith(
      massage.id,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      false,
    );
  });

  it("lets Pro add an unrated tool and archive it without erasing history", async () => {
    const user = userEvent.setup();
    const custom = {
      ...massage,
      id: "custom-id",
      name: "Sauna",
      is_custom: true,
      evidence: null,
    };
    let tools: RecoveryTool[] = [massage];
    vi.mocked(getRecoveryTools).mockImplementation(async () => ({
      tools,
      can_create_custom: true,
    }));
    vi.mocked(createRecoveryTool).mockImplementation(async () => {
      tools = [massage, custom];
      return custom;
    });
    vi.mocked(updateRecoveryTool).mockImplementation(async () => {
      tools = [massage, { ...custom, is_active: false }];
      return { ...custom, is_active: false };
    });
    renderRecovery();
    await screen.findByRole("button", { name: "Add custom tool" });
    expect(
      screen.queryByRole("textbox", { name: "Tool name" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add custom tool" }));
    await user.type(
      await screen.findByRole("textbox", { name: "Tool name" }),
      "Sauna",
    );
    await user.click(screen.getByRole("button", { name: "Add tool" }));
    expect(
      await screen.findByRole("checkbox", { name: "Sauna" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not research-rated")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Your custom tools" }),
      ).getByRole("checkbox", { name: "Sauna" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createRecoveryTool).toHaveBeenCalledWith("Sauna");
    await user.click(screen.getByRole("button", { name: "Archive Sauna" }));
    expect(
      await screen.findByRole("button", { name: "Restore Sauna" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Sauna" }),
    ).not.toBeInTheDocument();
  });

  it("leaves a failed check-off unchanged and shows the error", async () => {
    vi.mocked(setRecoveryCheckoff).mockRejectedValue(
      new Error("Network unavailable."),
    );
    renderRecovery();
    const checkbox = await screen.findByRole("checkbox", { name: "Massage" });
    await userEvent.click(checkbox);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network unavailable.",
    );
    expect(checkbox).not.toBeChecked();
  });

  it("loads the selected calendar date and its seven-day window", async () => {
    renderRecovery();
    await screen.findByRole("checkbox", { name: "Massage" });
    fireEvent.change(screen.getByLabelText("Tracking date"), {
      target: { value: "2026-09-20" },
    });
    await waitFor(() =>
      expect(getRecoveryEntries).toHaveBeenLastCalledWith(
        "2026-09-14",
        "2026-09-20",
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "On 2026-09-20" }),
    ).toBeInTheDocument();
  });

  it("moves between days, selects history, and returns to today", async () => {
    const user = userEvent.setup();
    renderRecovery();
    await screen.findByRole("checkbox", { name: "Massage" });
    const input = screen.getByLabelText("Tracking date");
    const today = (input as HTMLInputElement).value;
    fireEvent.change(input, { target: { value: "2026-09-20" } });
    await user.click(
      await screen.findByRole("button", { name: "Previous day" }),
    );
    await waitFor(() => expect(input).toHaveValue("2026-09-19"));
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(input).toHaveValue("2026-09-20"));
    await user.click(screen.getByRole("button", { name: /2026-09-18:/ }));
    await waitFor(() => expect(input).toHaveValue("2026-09-18"));
    await user.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(input).toHaveValue(today));
  });

  it("preserves the name when custom creation is refused", async () => {
    vi.mocked(getRecoveryTools).mockResolvedValue({
      tools: [massage],
      can_create_custom: true,
    });
    vi.mocked(createRecoveryTool).mockRejectedValue(
      new Error("Pro is required to add custom recovery tools."),
    );
    renderRecovery();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add custom tool" }),
    );
    const input = await screen.findByRole("textbox", { name: "Tool name" });
    await userEvent.type(input, "Sauna");
    await userEvent.click(screen.getByRole("button", { name: "Add tool" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pro is required",
    );
    expect(input).toHaveValue("Sauna");
  });

  it("shows a useful load error instead of an empty catalog", async () => {
    vi.mocked(getRecoveryTools).mockRejectedValue(new Error("Offline"));
    renderRecovery();
    expect(
      await screen.findByText("Recovery failed to load. Please try again."),
    ).toBeInTheDocument();
  });

  it("keeps evidence expandable and lets Pro cancel without creating a tool", async () => {
    vi.mocked(getRecoveryTools).mockResolvedValue({
      tools: [massage],
      can_create_custom: true,
    });
    const user = userEvent.setup();
    renderRecovery();
    await screen.findByRole("checkbox", { name: "Massage" });
    const details = screen.getByText("Research details").closest("details");
    expect(details).not.toHaveAttribute("open");
    await user.click(screen.getByText("Research details"));
    expect(details).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Add custom tool" }));
    await user.type(
      screen.getByRole("textbox", { name: "Tool name" }),
      "Sauna",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createRecoveryTool).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Add custom tool" }),
    ).toHaveFocus();
  });
});
