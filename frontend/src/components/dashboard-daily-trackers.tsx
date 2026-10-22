import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMeQuery } from "../features/auth/use-me-query";
import { getDietEntries } from "../features/diet/diet-api";
import { localDay, shiftDay } from "../features/diet/diet-dates";
import { getRecoveryEntries } from "../features/recovery/recovery-api";
import { getStretchEntries } from "../features/stretching/stretching-api";
import { getWorkoutRange } from "../features/workouts/workout-api";

interface DailyRecord {
  performed_on: string;
  completed_set_count?: number;
}

const trackers = [
  {
    name: "Diet",
    to: "/diet",
    key: "diet",
    icon: "M4 10h16a8 8 0 0 1-16 0ZM8 20h8M9 3v3m6-3v3",
    singular: "food",
    plural: "foods",
    load: getDietEntries,
  },
  {
    name: "Stretching",
    to: "/stretching",
    key: "stretching",
    icon: "M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-8 3 8 1 8-3M12 11l-2 5-5 4m5-4 7 4",
    singular: "stretch logged",
    plural: "stretches logged",
    load: getStretchEntries,
  },
  {
    name: "Recovery",
    to: "/recovery",
    key: "recovery",
    icon: "M20 4C12 3 5 7 5 13a6 6 0 0 0 10 4c4-4 5-9 5-13ZM4 21l11-11",
    singular: "activity",
    plural: "activities",
    load: getRecoveryEntries,
  },
  {
    name: "Workouts",
    to: "/workouts",
    key: "workouts",
    icon: "m7 7 10 10M3 7l4-4m10 18 4-4M2 6l4-4m12 20 4-4M5 9l4-4m6 14 4-4",
    singular: "completed set",
    plural: "completed sets",
    load: getWorkoutRange,
  },
] as const;

export function DashboardDailyTrackers() {
  const today = localDay(new Date());
  return (
    <section className="dashboard-daily-trackers" aria-label="Today's logs">
      <header className="dashboard-daily-head">
        <h2>Today's logs</h2>
        <p>
          {new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(new Date())}{" "}
          · Open a tracker to record
        </p>
      </header>
      {trackers.map((tracker) => (
        <TrackerRow key={tracker.key} tracker={tracker} today={today} />
      ))}
    </section>
  );
}

function TrackerRow({
  tracker,
  today,
}: {
  tracker: (typeof trackers)[number];
  today: string;
}) {
  const owner = useMeQuery().data?.email;
  const workouts = tracker.key === "workouts";
  const history = useQuery<DailyRecord[]>({
    queryKey: workouts
      ? ["workouts", owner, "week", today]
      : [tracker.key, owner, "entries", "history", today],
    queryFn: () => tracker.load(shiftDay(today, -6), today),
    enabled: !!owner,
  });
  const records = history.data ?? [];
  const count = records
    .filter((record) => record.performed_on === today)
    .reduce(
      (sum, record) => sum + (workouts ? (record.completed_set_count ?? 0) : 1),
      0,
    );
  const days = new Set(
    records
      .filter((record) => !workouts || (record.completed_set_count ?? 0) > 0)
      .map((record) => record.performed_on),
  ).size;
  return (
    <Link
      to={tracker.to}
      search={{}}
      className="dashboard-tracker-row"
      data-tracker={tracker.key}
    >
      <span className="dashboard-tracker-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <path d={tracker.icon} />
        </svg>
      </span>
      <span>
        <strong>{tracker.name}</strong>
        {history.isError ? (
          <small role="status">
            {tracker.name} couldn't load. Open {tracker.name} to retry.
          </small>
        ) : history.isPending ? (
          <small role="status">Loading {tracker.name.toLowerCase()}…</small>
        ) : (
          <>
            <small className="dashboard-tracker-today">
              {count} {count === 1 ? tracker.singular : tracker.plural} today
            </small>
            <small className="dashboard-tracker-week">
              {days} of 7 days {workouts ? "trained" : "recorded"}
            </small>
          </>
        )}
      </span>
      <span className="dashboard-tracker-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
