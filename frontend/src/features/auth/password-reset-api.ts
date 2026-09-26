interface PasswordResetErrorResponse {
  detail?: string;
  email?: string[];
  token?: string[];
  new_password?: string[];
}

async function throwPasswordResetError(
  response: Response,
  fallback: string,
): Promise<never> {
  let message = fallback;

  try {
    const data = (await response.json()) as PasswordResetErrorResponse;
    message =
      data.detail ??
      data.email?.[0] ??
      data.token?.[0] ??
      data.new_password?.[0] ??
      fallback;
  } catch {
    // Keep the stable fallback when the response is not JSON.
  }

  throw new Error(message);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch("/api/auth/password/request/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    await throwPasswordResetError(response, "Password reset request failed");
  }
}

interface ConfirmPasswordResetValues {
  uid: string;
  token: string;
  newPassword: string;
}

export async function confirmPasswordReset({
  uid,
  token,
  newPassword,
}: ConfirmPasswordResetValues): Promise<void> {
  const response = await fetch("/api/auth/password/confirm/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uid,
      token,
      new_password: newPassword,
    }),
  });

  if (!response.ok) {
    await throwPasswordResetError(response, "Password reset failed");
  }
}
