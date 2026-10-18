import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { PersonalInfoPanel } from "./personal-info-panel";
import { getPersonalInfo, updatePersonalInfo } from "./personal-info-api";

vi.mock("./personal-info-api", () => ({
  getPersonalInfo: vi.fn(),
  updatePersonalInfo: vi.fn(),
}));

const profile = {
  date_of_birth: null,
  sex: null,
  height_cm: null,
  age: null,
  estimated_bmr: {
    value: null,
    unit: "kcal/day",
    formula: "mifflin_st_jeor",
    missing_fields: ["date_of_birth", "sex", "height_cm", "body_weight"],
    reason: "missing_information",
    weight: null,
  },
};

beforeEach(() => vi.resetAllMocks());

it("loads personal info and explicitly saves date of birth, sex and height", async () => {
  const user = userEvent.setup();
  vi.mocked(getPersonalInfo).mockResolvedValue(profile);
  vi.mocked(updatePersonalInfo).mockResolvedValue({
    ...profile,
    date_of_birth: "1990-04-20",
    sex: "male",
    height_cm: 180,
    age: 36,
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PersonalInfoPanel />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Date of birth"), {
    target: { value: "1990-04-20" },
  });
  await user.selectOptions(
    screen.getByLabelText("Sex for calculation"),
    "male",
  );
  await user.type(screen.getByLabelText("Height (cm)"), "180");
  expect(updatePersonalInfo).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save personal info" }));
  expect(updatePersonalInfo).toHaveBeenCalledWith({
    date_of_birth: "1990-04-20",
    sex: "male",
    height_cm: 180,
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Personal info saved",
  );
});

it("clears saved personal details and updates the cached estimate", async () => {
  const user = userEvent.setup();
  vi.mocked(getPersonalInfo).mockResolvedValue({
    ...profile,
    date_of_birth: "1990-04-20",
    sex: "male",
    height_cm: 180,
    age: 36,
    estimated_bmr: {
      ...profile.estimated_bmr,
      value: 1750,
      missing_fields: [],
      reason: null,
    },
  });
  vi.mocked(updatePersonalInfo).mockResolvedValue(profile);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PersonalInfoPanel />
    </QueryClientProvider>,
  );
  expect(await screen.findByDisplayValue("180")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear personal info" }));
  expect(updatePersonalInfo).toHaveBeenCalledWith({
    date_of_birth: null,
    sex: null,
    height_cm: null,
  });
  await screen.findByRole("status");
  expect(screen.getByLabelText("Date of birth")).toHaveValue("");
  expect(screen.getByLabelText("Height (cm)")).toHaveValue(null);
  expect(screen.queryByText("1,750")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Log body weight" })).toHaveAttribute(
    "href",
    "/metrics/body_weight",
  );
});

it("preserves the draft when saving fails", async () => {
  const user = userEvent.setup();
  vi.mocked(getPersonalInfo).mockResolvedValue(profile);
  vi.mocked(updatePersonalInfo).mockRejectedValue(
    new Error("Personal info failed to save. Please try again."),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PersonalInfoPanel />
    </QueryClientProvider>,
  );
  await user.type(await screen.findByLabelText("Height (cm)"), "180");
  await user.click(screen.getByRole("button", { name: "Save personal info" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Personal info failed to save",
  );
  expect(screen.getByLabelText("Height (cm)")).toHaveValue(180);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("offers retry when personal info cannot load", async () => {
  const user = userEvent.setup();
  vi.mocked(getPersonalInfo)
    .mockRejectedValueOnce(new Error("Load failed"))
    .mockResolvedValue(profile);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PersonalInfoPanel />
    </QueryClientProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: "Retry personal info" }),
  );
  expect(await screen.findByLabelText("Date of birth")).toBeInTheDocument();
});
