import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { getMe } from "./auth-me-api";

interface RequireAuthBeforeLoadArgs {
  context: {
    queryClient: QueryClient;
  };
}

export async function requireAuthBeforeLoad({
  context,
}: RequireAuthBeforeLoadArgs) {
  try {
    await context.queryClient.ensureQueryData({
      queryKey: ["me"],
      queryFn: getMe,
    });
  } catch {
    throw redirect({ to: "/login" });
  }
}
