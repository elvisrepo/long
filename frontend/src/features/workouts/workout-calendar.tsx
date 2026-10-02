import { useQuery } from "@tanstack/react-query";
import { getWorkoutRange } from "./workout-api";
import { localDay, shiftDay, type NavigateWorkout } from "./workout-navigation";

export function WorkoutCalendar({
  owner,
  date,
  busy,
  navigate,
}: {
  owner: string;
  date: string;
  busy: boolean;
  navigate: NavigateWorkout;
}) {
  const first = date.slice(0, 7) + "-01";
  const next = new Date(first + "T12:00:00");
  next.setMonth(next.getMonth() + 1);
  const last = shiftDay(localDay(next), -1);
  const query = useQuery({
    queryKey: ["workouts", owner, "month", first],
    queryFn: () => getWorkoutRange(first, last),
  });
  const days = Number(last.slice(-2));
  const leading = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  const previous = new Date(first + "T12:00:00");
  previous.setMonth(previous.getMonth() - 1);
  return (
    <section className="workout-card">
      <div className="workout-card-heading">
        <button
          aria-label="Previous month"
          disabled={busy || query.isFetching}
          onClick={() =>
            navigate({ view: "calendar", date: localDay(previous) })
          }
        >
          ←
        </button>
        <h2>
          {new Date(first + "T12:00:00").toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          aria-label="Next month"
          disabled={busy || query.isFetching}
          onClick={() => navigate({ view: "calendar", date: localDay(next) })}
        >
          →
        </button>
      </div>
      {query.isPending ? (
        <p role="status">Loading month…</p>
      ) : query.isError ? (
        <>
          <p role="alert">Month couldn't load. No empty history is assumed.</p>
          <button onClick={() => void query.refetch()}>Retry month</button>
        </>
      ) : (
        <>
          <p>T = training with completed sets. P = planned-only sessions.</p>
          <div className="workout-calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: leading }, (_, n) => (
              <span key={`empty-${n}`} />
            ))}
            {Array.from({ length: days }, (_, n) => {
              const day = first.slice(0, 8) + String(n + 1).padStart(2, "0");
              const sessions = query.data.filter((w) => w.performed_on === day);
              const trained = sessions.filter(
                (w) => w.completed_set_count > 0,
              ).length;
              const planned = sessions.length - trained;
              return (
                <button
                  key={day}
                  disabled={busy}
                  aria-pressed={date === day}
                  aria-label={`${day}: ${trained} training session${trained === 1 ? "" : "s"}, ${planned} planned session${planned === 1 ? "" : "s"}`}
                  onClick={() => navigate({ view: "home", date: day })}
                >
                  <span>{n + 1}</span>
                  {trained > 0 && <small title="Training sessions">T{trained}</small>}
                  {planned > 0 && <small title="Planned sessions">P{planned}</small>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
