export function CalculatorField({
  label,
  value,
  onChange,
  step = 2.5,
  min = 0,
  max = 10000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const change = (direction: number) =>
    onChange(
      String(
        Number(
          Math.min(
            max,
            Math.max(min, Number(value) + direction * step),
          ).toFixed(3),
        ),
      ),
    );
  return (
    <div className="workout-calculator-field">
      <button
        aria-label={`Decrease ${label}`}
        disabled={Number(value) <= min}
        onClick={() => change(-1)}
      >
        −
      </button>
      <label>
        {label}
        <input
          type="number"
          min={min}
          max={max}
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button
        aria-label={`Increase ${label}`}
        disabled={Number(value) >= max}
        onClick={() => change(1)}
      >
        ＋
      </button>
    </div>
  );
}
