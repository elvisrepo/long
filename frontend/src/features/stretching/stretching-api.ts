import { getAccessToken } from "../auth/auth-session";

export interface StretchExercise {
  id: string;
  slug: string;
  phase: "lower-body" | "upper-body";
  name: string;
  description: string;
  display_order: number;
}

export interface StretchPhase {
  slug: StretchExercise["phase"];
  name: string;
  exercises: StretchExercise[];
}

export interface StretchEntry {
  id: number;
  exercise_id: string;
  performed_on: string;
  created_at: string;
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error("Authentication required");
  const response = await fetch(`/api/v1/stretching/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = data ? Object.values(data)[0] : null;
    throw new Error(
      typeof error === "string"
        ? error
        : Array.isArray(error)
          ? String(error[0])
          : "Stretching request failed. Please try again.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function getStretchCatalog(): Promise<{ phases: StretchPhase[] }> {
  return request("exercises/");
}

export function getStretchEntries(
  from: string,
  to: string,
): Promise<StretchEntry[]> {
  return request(
    `entries/?${new URLSearchParams({ date_from: from, date_to: to })}`,
  );
}

export function setStretchCheckoff(
  exerciseId: string,
  day: string,
  checked: boolean,
): Promise<void> {
  return request(
    `entries/${encodeURIComponent(exerciseId)}/${encodeURIComponent(day)}/`,
    checked ? "PUT" : "DELETE",
    checked ? {} : undefined,
  );
}
