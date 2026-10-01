import { getAccessToken } from "../auth/auth-session";
export interface DietSection {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}
export interface DietFood extends DietSection {
  section_id: string;
}
export interface DietEntry {
  id: number;
  food_id: string;
  performed_on: string;
  created_at: string;
}
export interface DietCatalog {
  sections: DietSection[];
  foods: DietFood[];
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error("Authentication required");
  const response = await fetch(`/api/v1/diet/${path}`, {
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
          : "Diet request failed. Please try again.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function getDietCatalog(): Promise<DietCatalog> {
  return request("catalog/");
}
export function getDietEntries(from: string, to: string): Promise<DietEntry[]> {
  return request(
    `entries/?${new URLSearchParams({ date_from: from, date_to: to })}`,
  );
}
export function saveDietItem(
  kind: "sections" | "foods",
  id: string | undefined,
  data: {
    name?: string;
    section_id?: string;
    display_order?: number;
    is_active?: boolean;
  },
): Promise<DietSection | DietFood> {
  return request(
    `${kind}/${id ? `${encodeURIComponent(id)}/` : ""}`,
    id ? "PATCH" : "POST",
    data,
  );
}
export function setDietCheckoff(
  id: string,
  day: string,
  checked: boolean,
): Promise<void> {
  return request(
    `entries/${encodeURIComponent(id)}/${encodeURIComponent(day)}/`,
    checked ? "PUT" : "DELETE",
    checked ? {} : undefined,
  );
}
