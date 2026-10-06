import { getAccessToken } from "../auth/auth-session";

export interface RecoveryEvidence {
  outcome: string;
  smd: number;
  ci_lower: number;
  ci_upper: number;
  subjects: number;
  experimental_groups: number;
  citation: string;
  source_url: string;
}

export interface RecoveryTool {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  is_custom: boolean;
  evidence: RecoveryEvidence | null;
}

export interface RecoveryEntry {
  id: number;
  tool_id: string;
  performed_on: string;
  created_at: string;
}

export interface RecoveryCatalog {
  tools: RecoveryTool[];
  can_create_custom: boolean;
}

async function recoveryRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error("Authentication required");
  const response = await fetch(`/api/v1/recovery/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const value = payload ? Object.values(payload)[0] : null;
    throw new Error(
      typeof value === "string"
        ? value
        : Array.isArray(value)
          ? String(value[0])
          : "Recovery request failed. Please try again.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export function getRecoveryTools(): Promise<RecoveryCatalog> {
  return recoveryRequest("tools/");
}

export function getRecoveryEntries(
  dateFrom: string,
  dateTo: string,
): Promise<RecoveryEntry[]> {
  return recoveryRequest(
    `entries/?${new URLSearchParams({ date_from: dateFrom, date_to: dateTo })}`,
  );
}

export function setRecoveryCheckoff(
  toolId: string,
  day: string,
  checked: boolean,
): Promise<void> {
  return recoveryRequest(
    `entries/${encodeURIComponent(toolId)}/${encodeURIComponent(day)}/`,
    checked ? "PUT" : "DELETE",
    checked ? {} : undefined,
  );
}

export function createRecoveryTool(name: string): Promise<RecoveryTool> {
  return recoveryRequest("tools/", "POST", { name });
}

export function updateRecoveryTool(
  toolId: string,
  isActive: boolean,
): Promise<RecoveryTool> {
  return recoveryRequest(`tools/${encodeURIComponent(toolId)}/`, "PATCH", {
    is_active: isActive,
  });
}
