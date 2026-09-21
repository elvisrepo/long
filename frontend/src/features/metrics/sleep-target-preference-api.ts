import { getAccessToken } from "../auth/auth-session";

export interface SleepTargetPreference {
  target_minutes: number;
}

export async function getSleepTargetPreference(): Promise<SleepTargetPreference> {
  return requestSleepTargetPreference("GET");
}

export async function updateSleepTargetPreference(
  targetMinutes: number,
): Promise<SleepTargetPreference> {
  return requestSleepTargetPreference("PATCH", targetMinutes);
}

async function requestSleepTargetPreference(
  method: "GET" | "PATCH",
  targetMinutes?: number,
): Promise<SleepTargetPreference> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const response = await fetch("/api/v1/metrics/preferences/sleep/", {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "PATCH"
      ? { body: JSON.stringify({ target_minutes: targetMinutes }) }
      : {}),
  });

  if (!response.ok) {
    throw new Error(
      await readPreferenceError(response, "Sleep target failed to save"),
    );
  }

  return response.json();
}

async function readPreferenceError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") {
      return fallback;
    }
    const fields = body as Record<string, unknown>;
    if (typeof fields.detail === "string") {
      return fields.detail;
    }
    const targetErrors = fields.target_minutes;
    if (Array.isArray(targetErrors) && typeof targetErrors[0] === "string") {
      return targetErrors[0];
    }
  } catch {
    return fallback;
  }

  return fallback;
}
