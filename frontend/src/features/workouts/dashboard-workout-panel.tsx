import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMeQuery } from "../auth/use-me-query";
import { getWorkoutRange } from "./workout-api";
import { localDay, shiftDay } from "./workout-navigation";
import "./workout.css";

export function DashboardWorkoutPanel() {
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const history = useQuery({
    queryKey: ["workouts", owner, "week", today],
    queryFn: () => getWorkoutRange(shiftDay(today, -6), today),
    enabled: !!owner,
  });
  const count =
    history.data
      ?.filter((w) => w.performed_on === today)
      .reduce((sum, w) => sum + w.completed_set_count, 0) ?? 0;
  return (
    <section className="workout-card" aria-label="Workout log">
      <h2>Workout log</h2>
      {history.isError ? (
        <p role="status">Workouts couldn't load. Open Workouts to retry.</p>
      ) : history.isPending ? (
        <p role="status">Loading workout log…</p>
      ) : (
        <>
          <p>
            {count} completed {count === 1 ? "set" : "sets"} today
          </p>
          <p>
            {
              new Set(
                history.data
                  .filter((w) => w.completed_set_count > 0)
                  .map((w) => w.performed_on),
              ).size
            }{" "}
            of 7 days trained
          </p>
        </>
      )}
      <Link to="/workouts" search={{}}>
        Track workouts →
      </Link>
    </section>
  );
}
