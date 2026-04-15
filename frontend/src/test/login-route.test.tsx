import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../features/auth/auth-api', () => ({
    loginWeb: vi.fn(),
  }))

import { renderRoute } from "./render-route";
import { loginWeb } from '../features/auth/auth-api'

describe("login route", () => {

  afterEach(() => {
      vi.clearAllMocks()
    })

  it("renders the login heading at /login", async () => {
    renderRoute("/login");

    expect(
      await screen.findByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("renders an email input at /login", async () => {
    renderRoute("/login");

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("renders a password input at /login", async () => {
    renderRoute("/login");

    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders a submit button at /login", async () => {
    renderRoute("/login");

    expect(
      await screen.findByRole("button", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("allows the user to type email and password", async () => {
    const user = userEvent.setup();

    renderRoute("/login");

    const emailInput = await screen.findByLabelText(/email/i);
    const passwordInput = await screen.findByLabelText(/password/i);

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "secret123");

    expect(emailInput).toHaveValue("user@example.com");
    expect(passwordInput).toHaveValue("secret123");
  });

  it('submits credentials to loginWeb from /login', async () => {
    const user = userEvent.setup()

    vi.mocked(loginWeb).mockResolvedValue({
      access: 'test-access-token'
    })

    renderRoute('/login')

    const emailInput = await screen.findByLabelText(/email/i)
    const passwordInput = await screen.findByLabelText(/password/i)
    const submitButton = await screen.findByRole('button', { name: /login/i })

    await user.type(emailInput, 'user@example.com')
    await user.type(passwordInput, 'secret123')
    await user.click(submitButton)

    await waitFor(() => {
        expect(loginWeb).toHaveBeenCalledWith({
          email: 'user@example.com',
          password: 'secret123',
        })
      })

  })

   it('shows the login error message when loginWeb rejects', async () => {
    const user = userEvent.setup()

    vi.mocked(loginWeb).mockRejectedValue(new Error('Invalid credentials.'))

    renderRoute('/login')

    const emailInput = await screen.findByLabelText(/email/i)
    const passwordInput = await screen.findByLabelText(/password/i)
    const submitButton = await screen.findByRole('button', { name: /login/i })

    await user.type(emailInput, 'user@example.com')
    await user.type(passwordInput, 'wrong-password')
    await user.click(submitButton)

    expect(
      await screen.findByText(/invalid credentials\./i),
    ).toBeInTheDocument()
  })

  it('disables the login button while login is in progress', async () => {
    const user = userEvent.setup()

    let resolveLogin: ((value: { access: string }) => void) | undefined

    vi.mocked(loginWeb).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve
      }),
    )

    renderRoute('/login')

    const emailInput = await screen.findByLabelText(/email/i)
    const passwordInput = await screen.findByLabelText(/password/i)
    const submitButton = await screen.findByRole('button', { name: /login/i })

    await user.type(emailInput, 'user@example.com')
    await user.type(passwordInput, 'secret123')
    await user.click(submitButton)

    expect(submitButton).toBeDisabled()

    resolveLogin?.({ access: 'test-access-token' })
  })
});
