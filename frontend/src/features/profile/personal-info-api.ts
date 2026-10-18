import { getAccessToken } from "../auth/auth-session";

export interface PersonalInfoInput {
  date_of_birth: string | null;
  sex: "male" | "female" | null;
  height_cm: number | null;
}

export interface EstimatedBmr {
  value: number | null;
  unit: string;
  formula: string;
  missing_fields: string[];
  reason: string | null;
  weight: {
    value: number;
    recorded_at: string;
    source: string;
    entry_id: number;
  } | null;
}

export interface PersonalInfo extends PersonalInfoInput {
  age: number | null;
  estimated_bmr: EstimatedBmr;
}

export function getPersonalInfo(): Promise<PersonalInfo> {
  return requestPersonalInfo("GET");
}

export function updatePersonalInfo(
  input: PersonalInfoInput,
): Promise<PersonalInfo> {
  return requestPersonalInfo("PATCH", input);
}

async function requestPersonalInfo(
  method: "GET" | "PATCH",
  input?: PersonalInfoInput,
): Promise<PersonalInfo> {
  const token = getAccessToken();
  if (!token) throw new Error("Authentication required");
  const response = await fetch("/api/v1/me/", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input ? { "Content-Type": "application/json" } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  if (!response.ok) {
    const fallback =
      method === "GET"
        ? "Personal info failed to load. Please try again."
        : "Personal info failed to save. Please try again.";
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null);
      if (body && typeof body === "object") {
        for (const [field, label] of Object.entries({
          date_of_birth: "Date of birth",
          height_cm: "Height",
          sex: "Sex",
        })) {
          const errors = (body as Record<string, unknown>)[field];
          if (Array.isArray(errors) && typeof errors[0] === "string")
            throw new Error(`${label}: ${errors[0]}`);
        }
      }
    }
    throw new Error(fallback);
  }
  return response.json();
}
