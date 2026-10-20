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
    icon: "◒",
    singular: "food",
    plural: "foods",
    load: getDietEntries,
  },
  {
    name: "Stretching",
    to: "/stretching",
    key: "stretching",
    icon: "↔",
    singular: "stretch logged",
    plural: "stretches logged",
    load: getStretchEntries,
  },
  {
    name: "Recovery",
    to: "/recovery",
    key: "recovery",
    icon: "◌",
    singular: "activity",
    plural: "activities",
    load: getRecoveryEntries,
  },
  {
    name: "Workouts",
    to: "/workouts",
    key: "workouts",
    icon: "↗",
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
      <p className="dashboard-daily-note">
        Logs show what you recorded, not completion targets.
      </p>
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
    <Link to={tracker.to} search={{}} className="dashboard-tracker-row">
      <span className="dashboard-tracker-icon" aria-hidden="true">
        {tracker.icon}
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
            <small>
              {count} {count === 1 ? tracker.singular : tracker.plural} today
            </small>
            <small>
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
