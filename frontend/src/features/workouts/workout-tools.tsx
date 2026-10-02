import { useState } from "react";
import type {
  SetInput,
  WorkoutExercise,
  WorkoutPreferences,
} from "./workout-api";
import {
  estimatedMax,
  percentageLoad,
  plateLoad,
  type Plate,
} from "./workout-calculators";

export function WorkoutTools({
  item,
  busy,
  onAdd,
  preferences,
  onSaveEquipment,
}: {
  item: WorkoutExercise;
  busy: boolean;
  onAdd: (data: SetInput) => Promise<void>;
  preferences?: WorkoutPreferences;
  onSaveEquipment?: (data: WorkoutPreferences) => Promise<void>;
}) {
  const unit = item.weight_unit;
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState<{ value: number; reps: number }>();
  const [base, setBase] = useState("");
  const [result, setResult] = useState<number>();
  const [pending, setPending] = useState(false);
  const [equipmentSaved, setEquipmentSaved] = useState(false);
  const [bar, setBar] = useState(
    preferences?.[unit === "kg" ? "bar_kg" : "bar_lb"] ??
      (unit === "kg" ? "20" : "45"),
  );
  const [plates, setPlates] = useState<Plate[]>(
    preferences?.[unit === "kg" ? "plates_kg" : "plates_lb"]?.map((plate) => ({
      weight: Number(plate.weight),
      count: plate.count,
    })) ??
      (unit === "kg"
        ? [25, 20, 15, 10, 5, 2.5, 1.25]
        : [45, 35, 25, 10, 5, 2.5]
      ).map((weight) => ({ weight, count: 0 })),
  );
  const [plateResult, setPlateResult] = useState<string>();
  const calculate = (action: () => void) => {
    setError("");
    try {
      action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calculation failed.");
    }
  };
  if (item.tracking_type !== "strength") return null;
  return (
    <details className="workout-inset">
      <summary>Workout calculators</summary>
      <p>
        Saved units: {unit}. Estimates are not observed lifts or lifting
        recommendations. Calculation inputs reset when you leave this exercise.
        Use Save equipment defaults to keep your bar and plate inventory.
      </p>
      <h3>Estimated 1RM</h3>
      <form
        onInput={() => setEstimate(undefined)}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          calculate(() => {
            const reps = Number(fd.get("estimate-reps"));
            setEstimate({
              value: estimatedMax(Number(fd.get("estimate-weight")), reps),
              reps,
            });
          });
        }}
      >
        <div className="workout-fields">
          <label>
            Lifted load ({unit})
            <input
              name="estimate-weight"
              type="number"
              min=".001"
              max="10000"
              step=".001"
              required
            />
          </label>
          <label>
            Lifted reps
            <input
              name="estimate-reps"
              type="number"
              min="1"
              max="30"
              step="1"
              required
            />
          </label>
        </div>
        <button>Calculate estimated 1RM</button>
      </form>
      <small>
        Epley: load × (1 + reps / 30); one rep returns entered load.{" "}
        <a
          href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9465738/"
          target="_blank"
          rel="noreferrer"
        >
          Formula and limitations
        </a>
        .
      </small>
      {estimate && (
        <>
          <p>
            Estimated 1RM: {estimate.value.toFixed(1)} {unit}
            {estimate.reps > 10
              ? " · High-rep estimate; treat as especially uncertain."
              : ""}
          </p>
          <button
            onClick={() => {
              setBase(estimate.value.toFixed(3));
              setResult(undefined);
            }}
          >
            Use estimate as percentage base
          </button>
          <details>
            <summary>Estimated 2–15 rep loads</summary>
            <p>
              {Array.from(
                { length: 14 },
                (_, n) =>
                  `${n + 2} reps: ${(estimate.value / (1 + (n + 2) / 30)).toFixed(1)} ${unit}`,
              ).join(" · ")}
            </p>
          </details>
        </>
      )}
      <h3>Percentage set</h3>
      <form
        onInput={() => setResult(undefined)}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          calculate(() =>
            setResult(
              percentageLoad(
                Number(base),
                Number(fd.get("percent")),
                Number(fd.get("round")),
              ),
            ),
          );
        }}
      >
        <div className="workout-fields">
          <label>
            Base load ({unit})
            <input
              type="number"
              min=".001"
              max="10000"
              step=".001"
              required
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </label>
          <label>
            Percentage
            <input
              name="percent"
              type="number"
              min=".001"
              max="100"
              step=".001"
              defaultValue={80}
              required
            />
          </label>
          <label>
            Round to nearest ({unit})
            <input
              name="round"
              type="number"
              min=".001"
              max="1000"
              step=".001"
              defaultValue={2.5}
              required
            />
          </label>
        </div>
        <button>Calculate percentage</button>
      </form>
      {result !== undefined && (
        <div className="workout-actions">
          <output>
            {result} {unit}
          </output>
          <button
            disabled={busy || pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await onAdd({
                  weight: result.toFixed(3),
                  reps: null,
                  is_completed: false,
                });
                setResult(undefined);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Planned set could not be added.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            Add calculated planned set
          </button>
          <small>Reps remain unknown until you edit the planned set.</small>
        </div>
      )}
      <h3>Plate calculator</h3>
      <p>
        Enter the total number of each plate you actually have. Balanced loading
        uses pairs; an odd spare plate is not used.
      </p>
      <form
        onInput={() => setPlateResult(undefined)}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          calculate(() => {
            const total = Number(fd.get("target")),
              loaded = plateLoad(total, Number(fd.get("bar")), plates);
            setPlateResult(
              loaded === null
                ? "No exact balanced combination with this inventory."
                : loaded.length
                  ? `Each side: ${loaded.map((p) => `${p.perSide} × ${p.weight} ${unit}`).join(" + ")}. Total with bar: ${total} ${unit}.`
                  : `Bar only: ${total} ${unit}.`,
            );
          });
        }}
      >
        <div className="workout-fields">
          <label>
            Target including bar ({unit})
            <input
              name="target"
              type="number"
              min="0"
              max="1000"
              step=".001"
              required
            />
          </label>
          <label>
            Bar weight ({unit})
            <input
              name="bar"
              type="number"
              min="0"
              max="1000"
              step=".001"
              value={bar}
              disabled={pending}
              onChange={(event) => {
                setBar(event.target.value);
                setEquipmentSaved(false);
              }}
              required
            />
          </label>
        </div>
        {plates.map((p, n) => (
          <div className="workout-fields" key={n}>
            <label>
              Plate {n + 1} weight ({unit})
              <input
                type="number"
                min=".001"
                max="1000"
                step=".001"
                required
                value={p.weight}
                disabled={pending}
                onChange={(e) => {
                  setEquipmentSaved(false);
                  setPlates((rows) =>
                    rows.map((row, index) =>
                      index === n
                        ? { ...row, weight: Number(e.target.value) }
                        : row,
                    ),
                  );
                }}
              />
            </label>
            <label>
              Plate {n + 1} total count
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                required
                value={p.count}
                disabled={pending}
                onChange={(e) => {
                  setEquipmentSaved(false);
                  setPlates((rows) =>
                    rows.map((row, index) =>
                      index === n
                        ? { ...row, count: Number(e.target.value) }
                        : row,
                    ),
                  );
                }}
              />
            </label>
          </div>
        ))}
        <div className="workout-actions">
          <button
            type="button"
            disabled={pending || plates.length >= 20}
            onClick={() => {
              setEquipmentSaved(false);
              setPlates((rows) => [...rows, { weight: 1, count: 0 }]);
              setPlateResult(undefined);
            }}
          >
            Add custom plate size
          </button>
          <button>Calculate plates</button>
          {onSaveEquipment && (
            <button
              type="button"
              disabled={busy || pending}
              onClick={async () => {
                setError("");
                setEquipmentSaved(false);
                if (
                  !bar.trim() ||
                  !Number.isFinite(Number(bar)) ||
                  Number(bar) < 0 ||
                  Number(bar) > 1000
                ) {
                  setError("Enter a valid bar weight between 0 and 1000.");
                  return;
                }
                if (
                  plates.some(
                    (plate) =>
                      !Number.isFinite(plate.weight) ||
                      plate.weight < 0.001 ||
                      plate.weight > 1000 ||
                      !Number.isInteger(plate.count) ||
                      plate.count < 0 ||
                      plate.count > 100,
                  )
                ) {
                  setError(
                    "Enter valid plate weights and whole counts between 0 and 100.",
                  );
                  return;
                }
                setPending(true);
                try {
                  await onSaveEquipment({
                    [unit === "kg" ? "bar_kg" : "bar_lb"]:
                      Number(bar).toFixed(3),
                    [unit === "kg" ? "plates_kg" : "plates_lb"]: plates.map(
                      (plate) => ({
                        weight: plate.weight.toFixed(3),
                        count: plate.count,
                      }),
                    ),
                  });
                  setEquipmentSaved(true);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Equipment failed to save.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Save equipment defaults
            </button>
          )}
        </div>
      </form>
      {plateResult && <p role="status">{plateResult}</p>}
      {equipmentSaved && (
        <p role="status">Equipment defaults saved to your account.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
