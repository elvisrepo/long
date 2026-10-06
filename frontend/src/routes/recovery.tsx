import { createFileRoute } from "@tanstack/react-router";

import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { RecoveryScreen } from "../features/recovery/recovery-screen";

export const Route = createFileRoute("/recovery")({
  beforeLoad: requireAuthBeforeLoad,
  component: RecoveryScreen,
});
