import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkoutPreview } from "./workout-preview";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import type { NavigateWorkout } from "./workout-navigation";

export function RecordHistory({
  owner,
  exerciseId,
  date,
  filter,
  onClose,
  navigate,
  onGraph,
  newestFirst = false,
}: {
  onGraph?: () => void;
  newestFirst?: boolean;
  owner: string;
  exerciseId: string;
  date: string;
  filter: { reps: number; weight_unit: string; distance_unit: string };
  onClose: () => void;
  navigate: NavigateWorkout;
}) {
  const [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<{ date: string; id: string } | null>(
    null,
  );
  const query = useQuery({
    queryKey: [
      "workouts",
      owner,
      "record-history",
      exerciseId,
      date,
      filter,
      newestFirst,
      offset,
    ],
    queryFn: () =>
      api.getRecordPage(
        exerciseId,
        date,
        offset,
        newestFirst ? { ...filter, newest_first: true } : filter,
      ),
  });
  if (preview)
    return (
      <WorkoutPreview
        owner={owner}
        date={preview.date}
        workoutId={preview.id}
        navigate={navigate}
        onClose={() => setPreview(null)}
      />
    );
  return (
    <Modal labelledBy="record-history-title" onClose={onClose}>
      <h2 id="record-history-title">
        PR history · {filter.reps} reps · {filter.weight_unit}
      </h2>
      <p>
        First qualifying set, then strict improvements through {date}. Ties
        aren't new records. History is recomputed from saved completed sets, not
        an immutable audit log.
      </p>
      {query.isPending ? (
        <p role="status">Loading PR history…</p>
      ) : query.isError ? (
        <>
          <p role="alert">PR history couldn't load.</p>
          <button onClick={() => void query.refetch()}>Retry PR history</button>
        </>
      ) : (
        <>
          {newestFirst && offset === 0 && query.data.results[0] && (
            <section className="workout-current-record">
              <h3>Current record</h3>
              <button
                onClick={() => {
                  const record = query.data.results[0];
                  setPreview({
                    date: record.date,
                    id: record.source.workout_id,
                  });
                }}
              >
                {filter.reps}RM · {Number(query.data.results[0].value)}{" "}
                {filter.weight_unit}
                <br />
                {query.data.results[0].date}
              </button>
            </section>
          )}
          {newestFirst && <h3>Previous records</h3>}
          {query.data.results.length === 0 ? (
            <p>No record improvements found.</p>
          ) : (
            <div className="workout-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Source set</th>
                    <th scope="col">Workout</th>
                  </tr>
                </thead>
                <tbody>
                  {(newestFirst && offset === 0
                    ? query.data.results.slice(1)
                    : query.data.results
                  ).map((record) => (
                    <tr key={record.source.set_id}>
                      <td>{record.date}</td>
                      <td>
                        {Number(record.value)} {record.weight_unit} ×{" "}
                        {record.reps} reps
                      </td>
                      <td>
                        <button
                          aria-label={`Open source set from ${record.date}`}
                          onClick={() => {
                            setPreview({
                              date: record.date,
                              id: record.source.workout_id,
                            });
                          }}
                        >
                          Open source exercise
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p>
            {query.data.count} record{" "}
            {query.data.count === 1 ? "improvement" : "improvements"}
          </p>
          <div className="workout-actions">
            <button
              disabled={query.isFetching || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous records
            </button>
            <button
              disabled={query.isFetching || !query.data.next}
              onClick={() => setOffset(offset + 25)}
            >
              Next records
            </button>
          </div>
        </>
      )}
      {onGraph && <button onClick={onGraph}>Graph</button>}
      <button onClick={onClose}>Close PR history</button>
    </Modal>
  );
}
