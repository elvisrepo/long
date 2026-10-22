import { useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import { BulkSetDialog } from "./bulk-set-dialog";
import { HistorySetEditor } from "./history-set-editor";
import {
  historySetStats,
  historyWorkoutStats,
  type HistoryStat,
} from "./history-stats";
import {
  dayLabel,
  setLabel,
  type NavigateWorkout,
  type RunAction,
} from "./workout-navigation";

type SelectedSet = {
  workout: api.Workout;
  item: api.WorkoutExercise;
  set: api.WorkoutSet;
};
function Stats({ stats }: { stats: HistoryStat[] }) {
  return (
    <dl className="workout-history-stats">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
function compatible(source: api.WorkoutExercise, target: api.WorkoutExercise) {
  return (
    source.exercise_id === target.exercise_id &&
    source.tracking_type === target.tracking_type &&
    source.weight_unit === target.weight_unit &&
    source.distance_unit === target.distance_unit
  );
}
export function ExerciseTrainingHistory({
  workout,
  item,
  owner,
  busy,
  run,
  navigate,
  onTrack,
}: {
  workout: api.Workout;
  item: api.WorkoutExercise;
  owner: string;
  busy: boolean;
  run: RunAction;
  navigate: NavigateWorkout;
  onTrack: () => void;
}) {
  const client = useQueryClient();
  const [day, setDay] = useState<api.Workout | null>(null);
  const [selected, setSelected] = useState<SelectedSet | null>(null);
  const [copy, setCopy] = useState<{
    source: api.Workout;
    setId?: string;
  } | null>(null);
  const [edit, setEdit] = useState<SelectedSet | null>(null);
  const [bulk, setBulk] = useState<{
    workouts: api.Workout[];
    ids?: string[];
  } | null>(null);
  const history = useInfiniteQuery({
    queryKey: [
      "workouts",
      owner,
      "training-history",
      item.exercise_id,
      workout.performed_on,
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.getExerciseHistoryPage(
        item.exercise_id,
        workout.performed_on,
        pageParam,
      ),
    getNextPageParam: (last, pages) =>
      last.next && last.results.length
        ? pages.reduce((sum, page) => sum + page.results.length, 0)
        : undefined,
  });
  const records = useQuery({
    queryKey: [
      "workouts",
      owner,
      "training-history-records",
      item.exercise_id,
      workout.performed_on,
    ],
    queryFn: async () => {
      const results: api.PersonalRecordRow[] = [];
      let offset = 0;
      while (true) {
        const page = await api.getRecordPage(
          item.exercise_id,
          workout.performed_on,
          offset,
        );
        results.push(...page.results);
        if (!page.next) return results;
        if (!page.results.length)
          throw new Error("Record markers could not fully load.");
        offset += page.results.length;
      }
    },
  });
  const recordIds = new Set(
    records.data?.map((record) => record.source.set_id),
  );
  const sessions = [
    workout,
    ...(history.data?.pages.flatMap((page) => page.results) ?? []).filter(
      (source) => source.id !== workout.id,
    ),
  ]
    .filter(
      (source, index, rows) =>
        rows.findIndex((row) => row.id === source.id) === index,
    )
    .sort((a, b) => b.performed_on.localeCompare(a.performed_on));
  const matches = (source: api.Workout) =>
    source.exercises.filter((row) => row.exercise_id === item.exercise_id);
  const copyable = (source: api.Workout) =>
    matches(source).some((row) => compatible(row, item) && row.sets.length > 0);
  const openWorkout = (source: api.Workout) => {
    setDay(null);
    setSelected(null);
    navigate({ view: "home", date: source.performed_on, session: source.id });
  };
  return (
    <div className="workout-training-history">
      {history.isPending && <p role="status">Loading exercise history…</p>}
      {history.isError && (
        <div>
          <p role="alert">Exercise history couldn't load.</p>
          <button onClick={() => void history.refetch()}>
            Retry exercise history
          </button>
        </div>
      )}
      {records.isError && (
        <div>
          <small>Personal record markers couldn't load.</small>
          <button onClick={() => void records.refetch()}>
            Retry record markers
          </button>
        </div>
      )}
      {sessions.map((source) => (
        <section key={source.id} className="workout-history-day">
          <button
            className="workout-history-date"
            aria-label={`Workout on ${dayLabel(source.performed_on)} · ${source.name}`}
            disabled={busy}
            onClick={() => setDay(source)}
          >
            <span>{dayLabel(source.performed_on)}</span>
            {source.id === workout.id && <small>Current session</small>}
          </button>
          {matches(source).map((row) => (
            <div key={row.id}>
              {row.sets.map((set, index) => (
                <button
                  className={`workout-history-set${!set.is_completed ? " is-planned" : ""}`}
                  key={set.id}
                  aria-label={`Set ${index + 1} on ${dayLabel(source.performed_on)} · ${setLabel(row, set)}`}
                  disabled={busy}
                  onClick={() =>
                    setSelected({ workout: source, item: row, set })
                  }
                >
                  <span className="workout-history-markers">
                    <span aria-hidden="true">{set.comment ? "▤" : ""}</span>
                    {set.is_completed && recordIds.has(set.id) && (
                      <span role="img" aria-label="Current personal record">
                        🏆
                      </span>
                    )}
                  </span>
                  <span className="workout-history-values">
                    {row.tracking_type === "strength" ||
                    row.tracking_type === "bodyweight" ? (
                      <>
                        <span>
                          {set.weight === null ? "—" : Number(set.weight)}{" "}
                          <small>{row.weight_unit}</small>
                        </span>
                        <span>
                          {set.reps ?? "—"} <small>reps</small>
                        </span>
                      </>
                    ) : (
                      <>
                        {row.tracking_type === "cardio" && (
                          <span>
                            {set.distance === null ? "—" : Number(set.distance)}{" "}
                            <small>{row.distance_unit}</small>
                          </span>
                        )}
                        <span>
                          {set.duration_seconds ?? "—"} <small>sec</small>
                        </span>
                      </>
                    )}
                  </span>
                  {set.comment && (
                    <small className="workout-history-comment">
                      {set.comment}
                    </small>
                  )}
                  {!set.is_completed && (
                    <small className="workout-history-comment">Planned</small>
                  )}
                </button>
              ))}
            </div>
          ))}
          {!matches(source).some((row) => row.sets.length > 0) && (
            <p className="workout-note">No sets recorded for this exercise.</p>
          )}
        </section>
      ))}
      {history.hasNextPage && (
        <button
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {history.isFetchingNextPage ? "Loading…" : "Load older sessions"}
        </button>
      )}
      {history.isFetchNextPageError && (
        <p role="alert">
          Older sessions couldn't load. Try loading them again.
        </p>
      )}
      <div className="workout-actions">
        <button disabled={busy} onClick={onTrack}>
          Back to Track
        </button>
        <button disabled={busy} onClick={() => setBulk({ workouts: sessions })}>
          Edit multiple sets
        </button>
      </div>
      {day && (
        <Modal
          labelledBy="history-day-title"
          onClose={() => setDay(null)}
          busy={busy}
        >
          <h2 id="history-day-title">{dayLabel(day.performed_on)}</h2>
          {historyWorkoutStats(matches(day)).map((group) => (
            <section key={group.unit}>
              {historyWorkoutStats(matches(day)).length > 1 && (
                <h3>{group.unit}</h3>
              )}
              <Stats stats={group.stats} />
            </section>
          ))}
          <small>Totals include completed sets for this exercise.</small>
          <div className="workout-history-dialog-actions">
            <button disabled={busy} onClick={() => openWorkout(day)}>
              View workout
            </button>
            <button
              disabled={busy || day.is_finished}
              onClick={() => {
                setBulk({
                  workouts: [day],
                  ids: matches(day)
                    .flatMap((row) => row.sets.map((set) => set.id))
                    .slice(0, 100),
                });
                setDay(null);
              }}
            >
              Edit sets
            </button>
            <button
              disabled={busy || workout.is_finished || !copyable(day)}
              onClick={() => {
                setCopy({ source: day });
                setDay(null);
              }}
            >
              Copy sets
            </button>
          </div>
          {day.is_finished && (
            <small>Reopen this workout to edit its sets.</small>
          )}
          {!copyable(day) && (
            <small>No sets match the current exercise type and units.</small>
          )}
          <button disabled={busy} onClick={() => setDay(null)}>
            Close
          </button>
        </Modal>
      )}
      {selected && (
        <Modal
          labelledBy="history-set-title"
          onClose={() => setSelected(null)}
          busy={busy}
        >
          <h2 id="history-set-title">
            {setLabel(selected.item, selected.set)}
          </h2>
          <p className="workout-note">
            {dayLabel(selected.workout.performed_on)} ·{" "}
            {selected.set.is_completed ? "Completed" : "Planned"}
          </p>
          <Stats stats={historySetStats(selected.item, selected.set)} />
          {selected.set.comment && (
            <p className="workout-history-full-comment">
              {selected.set.comment}
            </p>
          )}
          <div className="workout-history-dialog-actions">
            <button
              disabled={busy || selected.workout.is_finished}
              onClick={() => {
                setEdit(selected);
                setSelected(null);
              }}
            >
              Edit set
            </button>
            <button
              disabled={
                busy || workout.is_finished || !compatible(selected.item, item)
              }
              onClick={() => {
                setCopy({ source: selected.workout, setId: selected.set.id });
                setSelected(null);
              }}
            >
              Copy set
            </button>
          </div>
          {selected.workout.is_finished && (
            <>
              <small>Reopen the source workout to edit this set.</small>
              <button
                disabled={busy}
                onClick={() => openWorkout(selected.workout)}
              >
                View workout
              </button>
            </>
          )}
          {!compatible(selected.item, item) && (
            <small>Copy requires the current exercise type and units.</small>
          )}
          <button disabled={busy} onClick={() => setSelected(null)}>
            Close
          </button>
        </Modal>
      )}
      {edit && (
        <HistorySetEditor
          item={edit.item}
          set={edit.set}
          busy={busy}
          run={run}
          onClose={() => setEdit(null)}
        />
      )}
      {copy && (
        <HistoryCopyDialog
          source={copy.source}
          target={item}
          setId={copy.setId}
          busy={busy}
          run={run}
          onClose={() => setCopy(null)}
        />
      )}
      {bulk && (
        <BulkSetDialog
          workouts={bulk.workouts}
          exerciseId={item.exercise_id}
          initialIds={bulk.ids}
          busy={busy}
          run={run}
          onClose={() => setBulk(null)}
          onRefresh={() => {
            setBulk(null);
            void client.invalidateQueries({ queryKey: ["workouts", owner] });
          }}
        />
      )}
    </div>
  );
}

function HistoryCopyDialog({
  source,
  target,
  setId,
  busy,
  run,
  onClose,
}: {
  source: api.Workout;
  target: api.WorkoutExercise;
  setId?: string;
  busy: boolean;
  run: RunAction;
  onClose: () => void;
}) {
  const rows = source.exercises
    .filter((item) => compatible(item, target))
    .flatMap((item) => item.sets.map((set) => ({ item, set })));
  const [ids, setIds] = useState(() =>
    rows
      .filter((row) => !setId || row.set.id === setId)
      .slice(0, 100)
      .map((row) => row.set.id),
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const locked = busy || pending;
  return (
    <Modal labelledBy="history-copy-title" busy={locked} onClose={onClose}>
      <h2 id="history-copy-title">Copy {setId ? "set" : "sets"}</h2>
      <p>{dayLabel(source.performed_on)} → current exercise</p>
      <small>
        Choose up to 100 sets. Copies start planned, without comments.
      </small>
      {error && <p role="alert">{error}</p>}
      <div className="workout-history-copy-list">
        {rows.map(({ item, set }, index) => (
          <label className="workout-check" key={set.id}>
            <input
              type="checkbox"
              aria-label={`Copy set ${index + 1}: ${setLabel(item, set)}`}
              checked={ids.includes(set.id)}
              disabled={locked || (!ids.includes(set.id) && ids.length >= 100)}
              onChange={(e) =>
                setIds((current) =>
                  e.target.checked
                    ? [...current, set.id]
                    : current.filter((id) => id !== set.id),
                )
              }
            />
            {setLabel(item, set)}
          </label>
        ))}
      </div>
      <div className="workout-actions">
        <button disabled={locked} onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={locked || !ids.length}
          onClick={() => {
            setPending(true);
            setError("");
            run(async () => {
              try {
                await api.copyWorkoutSets(target.id, source.id, ids);
                onClose();
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Sets could not copy.",
                );
              } finally {
                setPending(false);
              }
            });
          }}
        >
          Copy
        </button>
      </div>
    </Modal>
  );
}
