import { getAccessToken } from "./auth-session";

export interface CurrentUser {
  email: string;
}

interface ErrorResponse {
  detail?: string;
}

export async function getMe(): Promise<CurrentUser> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error("Missing access token");
  }

  const response = await fetch("/api/auth/me/", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    let errorMessage = "Failed to fetch current user";

    try {
      const errorData = (await response.json()) as ErrorResponse;

      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch {
      // Keep fallback error
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<CurrentUser>;
}
