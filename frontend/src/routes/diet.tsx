import { createFileRoute } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { DietScreen } from "../features/diet/diet-screen";
export const Route = createFileRoute("/diet")({
  beforeLoad: requireAuthBeforeLoad,
  component: DietScreen,
});
