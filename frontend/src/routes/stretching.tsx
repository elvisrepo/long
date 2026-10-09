import { createFileRoute } from "@tanstack/react-router";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { StretchingScreen } from "../features/stretching/stretching-screen";

export const Route = createFileRoute("/stretching")({
  beforeLoad: requireAuthBeforeLoad,
  component: StretchingScreen,
});
