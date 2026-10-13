import { getAccessToken } from "../auth/auth-session";

export interface StretchExercise {
  id: string;
  slug: string;
  phase: "lower-body" | "upper-body";
  name: string;
  description: string;
  dosage: string;
  display_order: number;
  is_visible: boolean;
  is_custom: boolean;
  is_active: boolean;
  image_url: string | null;
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

export interface StretchPreferences {
  show_shared_exercises: boolean;
  hidden_exercise_ids: string[];
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
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
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

export type StretchExerciseInput = {
  phase: StretchExercise["phase"];
  name: string;
  description: string;
  dosage: string;
  image?: File | null;
  remove_image?: boolean;
  is_active?: boolean;
};

function exerciseBody(input: StretchExerciseInput): FormData {
  const data = new FormData();
  data.set("phase", input.phase);
  data.set("name", input.name);
  data.set("description", input.description);
  data.set("dosage", input.dosage);
  if (input.image) data.set("image", input.image);
  if (input.remove_image) data.set("remove_image", "true");
  if (input.is_active !== undefined)
    data.set("is_active", String(input.is_active));
  return data;
}

export function createCustomStretch(
  input: StretchExerciseInput,
): Promise<StretchExercise> {
  return request("exercises/", "POST", exerciseBody(input));
}

export function updateCustomStretch(
  id: string,
  input: StretchExerciseInput,
): Promise<StretchExercise> {
  return request(
    `exercises/${encodeURIComponent(id)}/`,
    "PATCH",
    exerciseBody(input),
  );
}

export function archiveCustomStretch(id: string): Promise<void> {
  return request(`exercises/${encodeURIComponent(id)}/`, "DELETE");
}

export function getStretchPreferences(): Promise<StretchPreferences> {
  return request("preferences/");
}

export function updateStretchPreferences(
  preferences: Partial<StretchPreferences>,
): Promise<StretchPreferences> {
  return request("preferences/", "PATCH", preferences);
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
