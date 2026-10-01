import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMeQuery } from "../auth/use-me-query";
import { getDietCatalog, getDietEntries } from "./diet-api";
import { localDay, shiftDay } from "./diet-dates";
import "./diet.css";
export function DashboardDietPanel() {
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const catalog = useQuery({
    queryKey: ["diet", owner, "catalog"],
    queryFn: getDietCatalog,
    enabled: !!owner,
  });
  const history = useQuery({
    queryKey: ["diet", owner, "entries", "history", today],
    queryFn: () => getDietEntries(shiftDay(today, -6), today),
    enabled: !!owner,
  });
  const entries = history.data?.filter((e) => e.performed_on === today) ?? [];
  return (
    <section className="diet-card dashboard-diet" aria-label="Diet checklist">
      <h2>Diet checklist</h2>
      {catalog.isError || history.isError ? (
        <p role="status">Diet couldn't load. Open Diet to retry.</p>
      ) : catalog.isPending || history.isPending ? (
        <p role="status">Loading diet checklist…</p>
      ) : (
        <>
          <p>
            {entries.length
              ? `Today: ${entries.map((e) => catalog.data.foods.find((f) => f.id === e.food_id)?.name ?? "Archived food").join(" · ")}`
              : "No foods recorded today."}
          </p>
          <p>
            Foods recorded on{" "}
            {new Set(history.data.map((e) => e.performed_on)).size} of the last
            7 days. This is not a nutrition score.
          </p>
        </>
      )}
      <Link to="/diet">Track foods →</Link>
    </section>
  );
}
