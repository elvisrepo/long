import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMeQuery } from "../auth/use-me-query";
import { getRecoveryEntries } from "./recovery-api";
import { localDay, shiftDay } from "./recovery-dates";
import "./recovery.css";

export function DashboardRecoveryPanel() {
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const history = useQuery({
    queryKey: ["recovery", owner, "entries", "history", today],
    queryFn: () => getRecoveryEntries(shiftDay(today, -6), today),
    enabled: !!owner,
  });
  const todayEntries =
    history.data?.filter((entry) => entry.performed_on === today) ?? [];
  const recordedDays = new Set(history.data?.map((entry) => entry.performed_on))
    .size;
  return (
    <section
      className="recovery-panel dashboard-recovery"
      aria-label="Recovery activities"
    >
      <h2>Recovery activities</h2>
      {history.isError ? (
        <p role="status">
          Recovery activities couldn't load. Open Recovery to retry.
        </p>
      ) : history.isPending ? (
        <p role="status">Loading recovery activities…</p>
      ) : (
        <>
          <p>
            {todayEntries.length}{" "}
            {todayEntries.length === 1 ? "activity" : "activities"} today
          </p>
          <p>{recordedDays} of 7 days recorded</p>
        </>
      )}
      <Link to="/recovery">Track recovery →</Link>
    </section>
  );
}
