import { clearAccessToken, getAccessToken } from "./auth-session";

function authorization(): string {
  const token = getAccessToken();
  if (!token) throw new Error("Authentication required");
  return `Bearer ${token}`;
}

export async function downloadAccountData(): Promise<void> {
  const response = await fetch("/api/v1/me/export/", {
    headers: { Authorization: authorization() },
  });
  if (!response.ok) throw new Error("Account export failed. Please try again.");
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "longevity-account.json";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function deleteAccount(password: string): Promise<void> {
  const response = await fetch("/api/v1/me/", {
    method: "DELETE",
    credentials: "include",
    headers: {
      Authorization: authorization(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    let message = "Account deletion failed. Please try again.";
    try {
      const data = (await response.json()) as {
        detail?: string;
        password?: string[];
      };
      message = data.detail ?? data.password?.[0] ?? message;
    } catch {
      /* Keep the fallback for non-JSON responses. */
    }
    throw new Error(message);
  }
  clearAccessToken();
}
