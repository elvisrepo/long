import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMeQuery } from "../auth/use-me-query";
import { getRecoveryEntries, getRecoveryTools } from "./recovery-api";
import { localDay, shiftDay } from "./recovery-dates";
import "./recovery.css";

export function DashboardRecoveryPanel() {
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const catalog = useQuery({
    queryKey: ["recovery", owner, "tools"],
    queryFn: getRecoveryTools,
    enabled: !!owner,
  });
  const history = useQuery({
    queryKey: ["recovery", owner, "entries", "history", today],
    queryFn: () => getRecoveryEntries(shiftDay(today, -6), today),
    enabled: !!owner,
  });
  const todayEntries =
    history.data?.filter((entry) => entry.performed_on === today) ?? [];
  const names = todayEntries.map(
    (entry) =>
      catalog.data?.tools.find((tool) => tool.id === entry.tool_id)?.name ??
      "Archived activity",
  );
  const recordedDays = new Set(history.data?.map((entry) => entry.performed_on))
    .size;
  return (
    <section
      className="recovery-panel dashboard-recovery"
      aria-label="Recovery activities"
    >
      <h2>Recovery activities</h2>
      {catalog.isError || history.isError ? (
        <p role="status">
          Recovery activities couldn't load. Open Recovery to retry.
        </p>
      ) : catalog.isPending || history.isPending ? (
        <p role="status">Loading recovery activities…</p>
      ) : (
        <>
          <p>
            {names.length
              ? `Today: ${names.join(" · ")}`
              : "No recovery activities recorded today."}
          </p>
          <p>
            Activities recorded on {recordedDays}{" "}
            {recordedDays === 1 ? "day" : "days"} in the last 7 days.
          </p>
        </>
      )}
      <Link to="/recovery">Track recovery →</Link>
    </section>
  );
}
