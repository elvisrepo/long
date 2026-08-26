interface LoginWebParams {
  email: string;
  password: string;
}

interface LoginWebResponse {
  access: string;
}

interface ErrorResponse {
  detail?: string;
}

export async function loginWeb({
  email,
  password,
}: LoginWebParams): Promise<LoginWebResponse> {
  const response = await fetch("/api/auth/web/login/", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (!response.ok) {
    let errorMessage = "Login failed";

    try {
      const errorData = (await response.json()) as ErrorResponse;

      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch {
      // Keep the fallback error message when the response body is empty or invalid.
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<LoginWebResponse>;
}
