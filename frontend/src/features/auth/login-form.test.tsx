import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("submits the typed email and password", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    // passing that fake function as the onSubmit prop
    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /login/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret123",
    });
  });

  it("does not submit when email and password are empty", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /login/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('shows a validation message when submitted empty', async () => {
      const user = userEvent.setup()
      const handleSubmit = vi.fn()

      render(<LoginForm onSubmit={handleSubmit} />)

      await user.click(screen.getByRole('button', { name: /login/i }))

      expect(await screen.findByText(/email and password are required/i)).toBeInTheDocument()
    })

    it('clears the validation message after a valid submit', async () => {
      const user = userEvent.setup()
      const handleSubmit = vi.fn()

      render(<LoginForm onSubmit={handleSubmit} />)

      await user.click(screen.getByRole('button', { name: /login/i }))

      expect(
        await screen.findByText(/email and password are required/i),
      ).toBeInTheDocument()

      await user.type(screen.getByLabelText(/email/i), 'user@example.com')
      await user.type(screen.getByLabelText(/password/i), 'secret123')
      await user.click(screen.getByRole('button', { name: /login/i }))

      expect(
        screen.queryByText(/email and password are required/i),
      ).not.toBeInTheDocument()
    })

    it('clears the validation message when the user starts typing', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()

    render(<LoginForm onSubmit={handleSubmit} />)

    await user.click(screen.getByRole('button', { name: /login/i }))

    expect(
      await screen.findByText(/email and password are required/i),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')

    expect(
      screen.queryByText(/email and password are required/i),
    ).not.toBeInTheDocument()
  })
});
