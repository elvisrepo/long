import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../../components/modal";
import * as api from "./workout-api";
import { CalculatorField } from "./calculator-field";
import { PlateSettings } from "./plate-settings";
import {
  estimatedMax,
  percentageLoad,
  plateLoad,
  inventoryFor,
  calculatorNames,
  type CalculatorKind,
} from "./workout-calculators";

export function WorkoutTools({
  item,
  busy,
  onAdd,
  preferences,
  onSaveEquipment,
  exercises = [],
  date = new Date().toISOString().slice(0, 10),
  active,
  owner = "",
  onClose,
}: {
  item: api.WorkoutExercise;
  busy: boolean;
  onAdd: (data: api.SetInput) => Promise<void>;
  preferences?: api.WorkoutPreferences;
  onSaveEquipment?: (data: api.WorkoutPreferences) => Promise<void>;
  exercises?: api.Exercise[];
  date?: string;
  owner?: string;
  active?: CalculatorKind | null;
  onClose?: () => void;
}) {
  const unit = item.weight_unit;
  const last = item.sets.at(-1);
  const [local, setLocal] = useState<CalculatorKind | null>(null);
  const tool = active === undefined ? local : active;
  const [weight, setWeight] = useState(last?.weight ?? "0");
  const [reps, setReps] = useState(String(last?.reps ?? 5));
  const [base, setBase] = useState(last?.weight ?? "0");
  const [percent, setPercent] = useState("80");
  const [round, setRound] = useState(true);
  const [increment, setIncrement] = useState("2.5");
  const [picker, setPicker] = useState<"records" | "percent" | null>(null);
  const [settings, setSettings] = useState(false);
  const [equipment, setEquipment] = useState(preferences);
  const bar =
    equipment?.exercise_bars?.find(
      (b) => b.exercise_id === item.exercise_id && b.weight_unit === unit,
    )?.weight ??
    equipment?.[unit === "kg" ? "bar_kg" : "bar_lb"] ??
    (unit === "kg" ? "20" : "45");
  const [target, setTarget] = useState(last?.weight ?? bar);
  const [visual, setVisual] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const records = useQuery({
    queryKey: ["workouts", owner, "calculator-records", item.exercise_id, date],
    queryFn: () => api.getRecordPage(item.exercise_id, date),
    enabled: tool === "set" && picker === "records",
  });
  const close = () => {
    setLocal(null);
    setPicker(null);
    setError("");
    onClose?.();
  };
  let max: number | undefined,
    load: number | undefined,
    plateError = "",
    loaded: ReturnType<typeof plateLoad> = null;
  try {
    if (weight.trim() && reps.trim())
      max = estimatedMax(Number(weight), Number(reps));
  } catch {
    /* Incomplete inputs show no estimate. */
  }
  try {
    if (base.trim() && percent.trim() && (!round || increment.trim()))
      load = percentageLoad(
        Number(base),
        Number(percent),
        round ? Number(increment) : 0.001,
      );
  } catch {
    /* Incomplete inputs show no result. */
  }
  const inventory = inventoryFor(unit, equipment);
  if (tool === "plates") {
    try {
      if (!target.trim()) throw new Error("Enter a target including the bar.");
      loaded = plateLoad(
        Number(target),
        Number(bar),
        inventory
          .filter((p) => p.enabled ?? p.count > 0)
          .map((p) => ({ weight: Number(p.weight), count: p.count })),
      );
      if (loaded === null)
        plateError = "No exact balanced combination with this inventory.";
    } catch (reason) {
      plateError =
        reason instanceof Error
          ? reason.message
          : "Enter a valid target weight.";
    }
  }
  if (item.tracking_type !== "strength") return null;
  const menu = active === undefined && (
    <>
      {(Object.keys(calculatorNames) as CalculatorKind[]).map((kind) => (
        <button
          key={kind}
          onClick={() => {
            setLocal(kind);
            setError("");
          }}
        >
          {calculatorNames[kind]}
        </button>
      ))}
    </>
  );
  if (settings)
    return (
      <>
        {menu}
        <PlateSettings
          unit={unit}
          preferences={equipment}
          exercises={exercises}
          busy={busy}
          onClose={() => setSettings(false)}
          onSave={async (data) => {
            if (onSaveEquipment) await onSaveEquipment(data);
            setEquipment((current) => ({ ...current, ...data }));
          }}
        />
      </>
    );
  return (
    <>
      {menu}
      {tool && (
        <Modal
          labelledBy="workout-calculator-title"
          className="workout-calculator-modal"
          busy={pending}
          onClose={close}
        >
          <h2 id="workout-calculator-title">
            {tool === "max"
              ? "One-rep-max calculator"
              : tool === "set"
                ? "Set calculator"
                : "Plate calculator"}
          </h2>
          {error && <p role="alert">{error}</p>}
          {tool === "max" ? (
            <>
              <CalculatorField
                label={`Weight (${unit})`}
                value={weight}
                onChange={setWeight}
              />
              <CalculatorField
                label="Reps"
                value={reps}
                onChange={setReps}
                step={1}
                min={1}
                max={30}
              />
              {max === undefined ? (
                <p>Enter a positive weight and 1–30 whole reps.</p>
              ) : (
                <>
                  <div className="workout-rm-list">
                    {Array.from({ length: 15 }, (_, index) => {
                      const count = index + 1,
                        value = count === 1 ? max : max / (1 + count / 30);
                      return (
                        <div key={count}>
                          <span>{count}RM</span>
                          <div>
                            <strong>
                              {value.toFixed(1)} {unit}
                            </strong>
                            <small>{((value / max) * 100).toFixed(1)}%</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {Number(reps) > 10 && (
                    <p>
                      <small>
                        High-rep estimates are especially uncertain.
                      </small>
                    </p>
                  )}
                </>
              )}
              <small>
                Estimated using Epley; these are estimates, not recorded
                personal records.
              </small>
              <div className="workout-actions">
                <button onClick={close}>OK</button>
              </div>
            </>
          ) : tool === "set" ? (
            <>
              <CalculatorField
                label={`Base load (${unit})`}
                value={base}
                onChange={setBase}
              />
              <button
                className="workout-calculator-link"
                onClick={() =>
                  setPicker(picker === "records" ? null : "records")
                }
              >
                Select max
              </button>
              {picker === "records" && (
                <div className="workout-calculator-picker">
                  <h3>Personal records · {unit}</h3>
                  {records.isPending ? (
                    <p role="status">Loading records…</p>
                  ) : records.isError ? (
                    <>
                      <p role="alert">Records could not load.</p>
                      <button onClick={() => void records.refetch()}>
                        Retry
                      </button>
                    </>
                  ) : (
                    <>
                      {!records.data?.results.some(
                        (r) =>
                          r.weight_unit === unit &&
                          r.tracking_type === "strength" &&
                          r.source?.weight,
                      ) && <p>No records in these units yet.</p>}
                      {records.data?.results
                        .filter(
                          (r) =>
                            r.weight_unit === unit &&
                            r.tracking_type === "strength" &&
                            r.source?.weight,
                        )
                        .map((r, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setBase(r.source.weight!);
                              setPicker(null);
                            }}
                          >
                            {r.reps}RM · {Number(r.source.weight)} {unit}
                          </button>
                        ))}
                    </>
                  )}
                </div>
              )}
              <CalculatorField
                label="Percentage"
                value={percent}
                onChange={setPercent}
                step={5}
                min={0.001}
                max={100}
              />
              <button
                className="workout-calculator-link"
                onClick={() =>
                  setPicker(picker === "percent" ? null : "percent")
                }
              >
                Select percentage
              </button>
              {picker === "percent" && (
                <div className="workout-calculator-percentages">
                  {[40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100].map(
                    (value) => (
                      <button
                        key={value}
                        onClick={() => {
                          setPercent(String(value));
                          setPicker(null);
                        }}
                      >
                        {value}%
                      </button>
                    ),
                  )}
                </div>
              )}
              <p className="workout-calculator-result" role="status">
                {load === undefined
                  ? "Enter a positive base, 0–100% and valid rounding."
                  : `${load} ${unit}`}
              </p>
              <div className="workout-calculator-round">
                <label className="workout-check">
                  <input
                    type="checkbox"
                    checked={round}
                    onChange={(e) => setRound(e.target.checked)}
                  />
                  Round to closest
                </label>
                <select
                  aria-label={`Rounding increment (${unit})`}
                  disabled={!round}
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                >
                  {[0.25, 0.5, 1, 1.25, 2.5, 5, 10, 20, 25].map((n) => (
                    <option key={n} value={n}>
                      {n} {unit}
                    </option>
                  ))}
                </select>
              </div>
              <small>Adds a planned set. Enter reps when you log it.</small>
              <div className="workout-actions">
                <button disabled={pending} onClick={close}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={busy || pending || load === undefined || load <= 0}
                  onClick={async () => {
                    if (load === undefined) return;
                    setPending(true);
                    setError("");
                    try {
                      await onAdd({
                        weight: load.toFixed(3),
                        reps: null,
                        is_completed: false,
                      });
                      close();
                    } catch (reason) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Planned set could not be added.",
                      );
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Add to workout
                </button>
              </div>
            </>
          ) : (
            <>
              <CalculatorField
                label={`Target including bar (${unit})`}
                value={target}
                onChange={setTarget}
                max={1000}
              />
              <p className="workout-calculator-bar">
                {Number(bar)} {unit} bar +{" "}
                {Math.max(0, (Number(target) - Number(bar)) / 2)} {unit} each
                side
              </p>
              {plateError ? (
                <p role="status">{plateError}</p>
              ) : loaded?.length ? (
                <>
                  {visual && (
                    <div
                      className="workout-plate-diagram"
                      role="img"
                      aria-label={`Plates on each side: ${loaded.map((p) => `${p.perSide} × ${p.weight} ${unit}`).join(", ")}`}
                    >
                      <span className="workout-bar-shaft" />
                      {loaded.flatMap((p) =>
                        Array.from({ length: p.perSide }, (_, i) => (
                          <span
                            className="workout-loaded-plate"
                            key={`${p.weight}-${i}`}
                            style={{
                              background:
                                inventory.find(
                                  (row) => Number(row.weight) === p.weight,
                                )?.colour ?? "#64748b",
                              height: `${Math.min(160, 48 + p.weight * 4)}px`,
                            }}
                          />
                        )),
                      )}
                    </div>
                  )}
                  <div className="workout-plate-breakdown">
                    {loaded.map((p) => (
                      <p key={p.weight}>
                        {p.weight} {unit} × {p.perSide} <small>per side</small>
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <p role="status">
                  Bar only · {Number(bar)} {unit}
                </p>
              )}
              <div className="workout-actions">
                <button onClick={() => setSettings(true)}>Settings</button>
                <button onClick={() => setVisual(!visual)}>
                  {visual ? "Show list" : "Show plates"}
                </button>
                <button onClick={close}>OK</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
