import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "./workout-api";
import { RecordHistory } from "./record-history";

vi.mock("./workout-api");
beforeEach(() => vi.resetAllMocks());
const filter = { reps: 5, weight_unit: "kg", distance_unit: "km" };
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RecordHistory
        owner="owner"
        exerciseId="bench"
        date="2026-10-02"
        filter={filter}
        onClose={vi.fn()}
        navigate={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
it("paginates by local offsets without following response URLs", async () => {
  vi.mocked(api.getRecordPage)
    .mockResolvedValueOnce({
      count: 26,
      next: "https://untrusted.test/",
      previous: null,
      results: [],
    })
    .mockResolvedValueOnce({
      count: 26,
      next: null,
      previous: "previous",
      results: [],
    });
  mount();
  expect(
    await screen.findByRole("button", { name: "Previous records" }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Next records" }));
  expect(await screen.findByText("26 record improvements")).toBeInTheDocument();
  expect(api.getRecordPage).toHaveBeenLastCalledWith(
    "bench",
    "2026-10-02",
    25,
    filter,
  );
  expect(screen.getByRole("button", { name: "Next records" })).toBeDisabled();
});
it("keeps failures in the dialog and permits an explicit retry", async () => {
  vi.mocked(api.getRecordPage)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn't load");
  await userEvent.click(
    screen.getByRole("button", { name: "Retry PR history" }),
  );
  expect(
    await screen.findByText("No record improvements found."),
  ).toBeInTheDocument();
});
