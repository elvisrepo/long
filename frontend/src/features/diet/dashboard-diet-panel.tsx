import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMeQuery } from "../auth/use-me-query";
import { getDietEntries } from "./diet-api";
import { localDay, shiftDay } from "./diet-dates";
import "./diet.css";
export function DashboardDietPanel() {
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const history = useQuery({
    queryKey: ["diet", owner, "entries", "history", today],
    queryFn: () => getDietEntries(shiftDay(today, -6), today),
    enabled: !!owner,
  });
  const entries = history.data?.filter((e) => e.performed_on === today) ?? [];
  return (
    <section className="diet-card dashboard-diet" aria-label="Diet checklist">
      <h2>Diet checklist</h2>
      {history.isError ? (
        <p role="status">Diet couldn't load. Open Diet to retry.</p>
      ) : history.isPending ? (
        <p role="status">Loading diet checklist…</p>
      ) : (
        <>
          <p>
            {entries.length} {entries.length === 1 ? "food" : "foods"} today
          </p>
          <p>
            {new Set(history.data.map((e) => e.performed_on)).size} of 7 days
            recorded
          </p>
        </>
      )}
      <Link to="/diet">Track foods →</Link>
    </section>
  );
}
