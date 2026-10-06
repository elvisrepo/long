import { createFileRoute } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { parseWorkoutSearch } from "../features/workouts/workout-navigation";
import { WorkoutScreen } from "../features/workouts/workout-screen";
export const Route = createFileRoute("/workouts")({
  beforeLoad: requireAuthBeforeLoad,
  validateSearch: parseWorkoutSearch,
  component: WorkoutsRoute,
});
function WorkoutsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorkoutScreen
      search={search}
      onNavigate={(next) => void navigate({ search: next })}
    />
  );
}
