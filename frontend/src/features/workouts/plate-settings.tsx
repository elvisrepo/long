import { useState } from "react";
import { defaultPlates, inventoryFor } from "./workout-calculators";
import { Modal } from "../../components/modal";
import type {
  EquipmentPlate,
  Exercise,
  ExerciseBar,
  WorkoutPreferences,
} from "./workout-api";

export function PlateSettings({
  unit,
  preferences,
  exercises,
  busy,
  onSave,
  onClose,
}: {
  unit: "kg" | "lb";
  preferences?: WorkoutPreferences;
  exercises: Exercise[];
  busy: boolean;
  onSave: (data: WorkoutPreferences) => Promise<void>;
  onClose: () => void;
}) {
  const [bar, setBar] = useState(
    preferences?.[unit === "kg" ? "bar_kg" : "bar_lb"] ??
      (unit === "kg" ? "20" : "45"),
  );
  const [plates, setPlates] = useState(() => inventoryFor(unit, preferences));
  const [bars, setBars] = useState<ExerciseBar[]>(
    preferences?.exercise_bars ?? [],
  );
  const [edit, setEdit] = useState<number | "bars" | null>(null);
  const [exerciseId, setExerciseId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || pending;
  const update = (index: number, value: Partial<EquipmentPlate>) =>
    setPlates((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...value } : row)),
    );
  async function save() {
    setError("");
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
        (p) =>
          !p.weight.trim() ||
          !Number.isFinite(Number(p.weight)) ||
          Number(p.weight) <= 0 ||
          Number(p.weight) > 1000 ||
          !Number.isInteger(p.count) ||
          p.count < 0 ||
          p.count > 100,
      ) ||
      new Set(plates.map((p) => Number(p.weight))).size !== plates.length
    ) {
      setError(
        "Use distinct positive plate weights and whole counts from 0 to 100.",
      );
      return;
    }
    if (
      bars.some(
        (b) =>
          !b.weight.trim() ||
          !Number.isFinite(Number(b.weight)) ||
          Number(b.weight) < 0 ||
          Number(b.weight) > 1000,
      )
    ) {
      setError("Enter valid exercise bar weights between 0 and 1000.");
      return;
    }
    setPending(true);
    try {
      await onSave({
        [unit === "kg" ? "bar_kg" : "bar_lb"]: Number(bar).toFixed(3),
        [unit === "kg" ? "plates_kg" : "plates_lb"]: plates.map((p) => ({
          ...p,
          weight: Number(p.weight).toFixed(3),
        })),
        exercise_bars: bars.map((b) => ({
          ...b,
          weight: Number(b.weight).toFixed(3),
        })),
      });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Equipment failed to save.",
      );
    } finally {
      setPending(false);
    }
  }
  const plate = typeof edit === "number" ? plates[edit] : undefined;
  return (
    <Modal
      labelledBy="plate-settings-title"
      className="workout-calculator-modal"
      busy={locked}
      onClose={onClose}
    >
      <h2 id="plate-settings-title">
        {plate
          ? "Edit plate"
          : edit === "bars"
            ? "Barbell settings"
            : "Plate settings"}
      </h2>
      {error && <p role="alert">{error}</p>}
      {plate && typeof edit === "number" ? (
        <div className="workout-stack">
          <label>
            Plate weight ({unit})
            <input
              type="number"
              min="0.001"
              max="1000"
              step="0.001"
              value={plate.weight}
              disabled={locked}
              onChange={(e) => update(edit, { weight: e.target.value })}
            />
          </label>
          <label>
            Total plate count
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={plate.count}
              disabled={locked}
              onChange={(e) => update(edit, { count: Number(e.target.value) })}
            />
          </label>
          <label>
            Plate colour
            <input
              type="color"
              value={plate.colour ?? "#64748b"}
              disabled={locked}
              onChange={(e) => update(edit, { colour: e.target.value })}
            />
          </label>
          <div className="workout-actions">
            <button disabled={locked} onClick={() => setEdit(null)}>
              Done
            </button>
            <button
              disabled={locked}
              onClick={() => {
                setPlates((rows) => rows.filter((_, i) => i !== edit));
                setEdit(null);
              }}
            >
              Remove plate
            </button>
          </div>
        </div>
      ) : edit === "bars" ? (
        <div className="workout-stack">
          <label>
            Default bar weight ({unit})
            <input
              type="number"
              min="0"
              max="1000"
              step="0.001"
              value={bar}
              disabled={locked}
              onChange={(e) => setBar(e.target.value)}
            />
          </label>
          <h3>Exercise bar weights</h3>
          {bars
            .filter((b) => b.weight_unit === unit)
            .map((b) => (
              <div className="workout-equipment-row" key={b.exercise_id}>
                <label>
                  {exercises.find((e) => e.id === b.exercise_id)?.name ??
                    "Archived exercise"}
                  <input
                    aria-label={`Bar for ${exercises.find((e) => e.id === b.exercise_id)?.name ?? b.exercise_id}`}
                    type="number"
                    min="0"
                    max="1000"
                    step="0.001"
                    value={b.weight}
                    disabled={locked}
                    onChange={(e) =>
                      setBars((rows) =>
                        rows.map((row) =>
                          row === b ? { ...row, weight: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  disabled={locked}
                  aria-label={`Remove bar for ${exercises.find((e) => e.id === b.exercise_id)?.name ?? b.exercise_id}`}
                  onClick={() =>
                    setBars((rows) => rows.filter((row) => row !== b))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          <label>
            Exercise
            <select
              aria-label="Exercise"
              value={exerciseId}
              disabled={locked}
              onChange={(e) => setExerciseId(e.target.value)}
            >
              <option value="">Choose exercise</option>
              {exercises
                .filter(
                  (e) =>
                    e.tracking_type === "strength" &&
                    !bars.some(
                      (b) => b.exercise_id === e.id && b.weight_unit === unit,
                    ),
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={locked || !exerciseId}
            onClick={() => {
              setBars((rows) => [
                ...rows,
                { exercise_id: exerciseId, weight_unit: unit, weight: bar },
              ]);
              setExerciseId("");
            }}
          >
            Add exercise bar
          </button>
          <button disabled={locked} onClick={() => setEdit(null)}>
            Done
          </button>
        </div>
      ) : (
        <>
          <div className="workout-card-heading">
            <div>
              <small>Bar weight</small>
              <p>
                {Number(bar)} {unit}
              </p>
            </div>
            <button disabled={locked} onClick={() => setEdit("bars")}>
              Edit bar
            </button>
          </div>
          <div className="workout-card-heading">
            <h3>Plates</h3>
            <button
              disabled={locked || plates.length >= 20}
              onClick={() => {
                let weight = 1;
                while (plates.some((p) => Number(p.weight) === weight))
                  weight++;
                setPlates((rows) => [
                  ...rows,
                  {
                    weight: String(weight),
                    count: 2,
                    enabled: true,
                    colour: "#64748b",
                  },
                ]);
                setEdit(plates.length);
              }}
            >
              Add plate
            </button>
          </div>
          <p>
            <small>
              Counts are the total plates you own; balanced loading uses pairs.
            </small>
          </p>
          <div className="workout-plate-inventory">
            {plates.map((p, index) => (
              <div className="workout-equipment-row" key={index}>
                <button
                  disabled={locked}
                  aria-label={`Edit ${Number(p.weight)} ${unit} plate`}
                  onClick={() => setEdit(index)}
                >
                  <span
                    className="workout-plate-swatch"
                    style={{ background: p.colour }}
                  />
                  {Number(p.weight)} {unit} <small>× {p.count}</small>
                </button>
                <input
                  type="checkbox"
                  aria-label={`Available ${Number(p.weight)} ${unit} plate`}
                  disabled={locked}
                  checked={p.enabled ?? p.count > 0}
                  onChange={(e) =>
                    update(index, {
                      enabled: e.target.checked,
                      count: e.target.checked && p.count === 0 ? 2 : p.count,
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="workout-actions">
            <button
              disabled={locked}
              onClick={() => {
                setBar(unit === "kg" ? "20" : "45");
                setPlates(defaultPlates(unit));
                setBars((rows) => rows.filter((b) => b.weight_unit !== unit));
              }}
            >
              Reset
            </button>
            <button
              className="primary-button"
              disabled={locked}
              onClick={() => void save()}
            >
              Save equipment defaults
            </button>
            <button disabled={locked} onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
