import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AccountPanel } from "./account-panel";
import { deleteAccount, downloadAccountData } from "./account-api";

vi.mock("./account-api", () => ({
  deleteAccount: vi.fn(),
  downloadAccountData: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

it("requires a password and explicit confirmation before deleting", async () => {
  const user = userEvent.setup();
  const onDeleted = vi.fn();
  vi.mocked(deleteAccount).mockResolvedValue();
  render(<AccountPanel onDeleted={onDeleted} />);
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  expect(
    screen.getByText(
      /Any active Stripe subscription will be cancelled immediately/,
    ),
  ).toBeInTheDocument();
  const submit = screen.getByRole("button", {
    name: "Delete account permanently",
  });
  expect(submit).toBeDisabled();
  await user.type(screen.getByLabelText("Current password"), "my-password");
  expect(submit).toBeDisabled();
  await user.click(
    screen.getByLabelText("I understand this permanently deletes my account."),
  );
  await user.click(submit);
  expect(deleteAccount).toHaveBeenCalledWith("my-password");
  expect(onDeleted).toHaveBeenCalledOnce();
});

it("offers account export without a paid plan and reports download completion", async () => {
  const user = userEvent.setup();
  vi.mocked(downloadAccountData).mockResolvedValue();
  render(<AccountPanel onDeleted={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Download account data" }),
  );
  expect(downloadAccountData).toHaveBeenCalledOnce();
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Account data downloaded",
  );
});

it("keeps the account dialog open and clears the password when deletion fails", async () => {
  const user = userEvent.setup();
  const onDeleted = vi.fn();
  vi.mocked(deleteAccount).mockRejectedValue(
    new Error("Password is incorrect."),
  );
  render(<AccountPanel onDeleted={onDeleted} />);
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  await user.type(screen.getByLabelText("Current password"), "wrong");
  await user.click(
    screen.getByLabelText("I understand this permanently deletes my account."),
  );
  await user.click(
    screen.getByRole("button", { name: "Delete account permanently" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Password is incorrect.",
  );
  expect(screen.getByLabelText("Current password")).toHaveValue("");
  expect(onDeleted).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Keep account" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
