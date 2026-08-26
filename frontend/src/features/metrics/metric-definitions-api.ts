import { getAccessToken } from "../auth/auth-session";

export interface MetricDefinition {
  id: string;
  name: string;
  slug: string;
  unit: string;
  category: string;
  min_value: number;
  max_value: number;
  is_default: boolean;
  is_active: boolean;
}

export interface GetMetricDefinitionsOptions {
  includeInactive?: boolean;
}

export interface CreateMetricDefinitionInput {
  name: string;
  slug: string;
  unit: string;
  minValue: number;
  maxValue: number;
}

export interface UpdateMetricDefinitionInput {
  name?: string;
  unit?: string;
  minValue?: number;
  maxValue?: number;
  isActive?: boolean;
}

function formatMetricDefinitionError(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Metric definition request failed";
  }

  // DRF validation errors usually come back keyed by field, for example:
  // { slug: ['metric definition with this slug already exists.'] }.
  const firstValue = Object.values(payload)[0];

  if (Array.isArray(firstValue) && typeof firstValue[0] === "string") {
    return firstValue[0];
  }

  if (typeof firstValue === "string") {
    return firstValue;
  }

  return "Metric definition request failed";
}

export async function getMetricDefinitions(
  options: GetMetricDefinitionsOptions = {},
): Promise<MetricDefinition[]> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const searchParams = new URLSearchParams();

  if (options.includeInactive) {
    searchParams.set("include_inactive", "true");
  }

  const queryString = searchParams.toString();
  const url = queryString
    ? `/api/v1/metrics/definitions/?${queryString}`
    : "/api/v1/metrics/definitions/";

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Metric definitions failed to load");
  }

  return response.json() as Promise<MetricDefinition[]>;
}

export async function createMetricDefinition(
  input: CreateMetricDefinitionInput,
): Promise<MetricDefinition> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const response = await fetch("/api/v1/metrics/definitions/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    // Keep component-facing inputs idiomatic TypeScript, then map to the
    // backend's snake_case JSON contract at the API boundary.
    body: JSON.stringify({
      name: input.name,
      slug: input.slug,
      unit: input.unit,
      category: "custom",
      min_value: input.minValue,
      max_value: input.maxValue,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    throw new Error(formatMetricDefinitionError(payload));
  }

  return response.json() as Promise<MetricDefinition>;
}

export async function updateMetricDefinition(
  id: string,
  input: UpdateMetricDefinitionInput,
): Promise<MetricDefinition> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const body: Record<string, unknown> = {};

  if (input.name !== undefined) {
    body.name = input.name;
  }

  if (input.unit !== undefined) {
    body.unit = input.unit;
  }

  if (input.minValue !== undefined) {
    body.min_value = input.minValue;
  }

  if (input.maxValue !== undefined) {
    body.max_value = input.maxValue;
  }

  if (input.isActive !== undefined) {
    body.is_active = input.isActive;
  }

  const response = await fetch(`/api/v1/metrics/definitions/${id}/`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    throw new Error(formatMetricDefinitionError(payload));
  }

  return response.json() as Promise<MetricDefinition>;
}
