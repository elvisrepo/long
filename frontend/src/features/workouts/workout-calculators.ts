export function estimatedMax(weight: number, reps: number): number {
  if (
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 10000 ||
    !Number.isInteger(reps) ||
    reps < 1 ||
    reps > 30
  )
    throw new Error("Enter positive load and 1–30 whole reps.");
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function percentageLoad(
  base: number,
  percentage: number,
  increment: number,
): number {
  if (
    !Number.isFinite(base) ||
    base <= 0 ||
    base > 10000 ||
    !Number.isFinite(percentage) ||
    percentage <= 0 ||
    percentage > 100 ||
    !Number.isFinite(increment) ||
    increment < 0.001 ||
    increment > 1000
  )
    throw new Error(
      "Enter positive base load, 0–100% and a rounding increment of at least 0.001.",
    );
  return Number(
    (
      Math.round((base * percentage) / 100 / increment + 1e-9) * increment
    ).toFixed(3),
  );
}

export interface Plate {
  weight: number;
  count: number;
}
export interface LoadedPlate {
  weight: number;
  perSide: number;
}
export function plateLoad(
  total: number,
  bar: number,
  inventory: Plate[],
): LoadedPlate[] | null {
  const validWeight = (value: number) =>
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1000 &&
    Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;
  if (
    !validWeight(total) ||
    !validWeight(bar) ||
    total < bar ||
    inventory.length > 20 ||
    inventory.some(
      (p) =>
        !validWeight(p.weight) ||
        p.weight <= 0 ||
        !Number.isInteger(p.count) ||
        p.count < 0 ||
        p.count > 100,
    )
  )
    throw new Error(
      "Use loads up to 1000 with 3 decimal places, at most 20 plate sizes and 0–100 available plates each. Target must include the bar.",
    );
  const difference = Math.round(total * 1000) - Math.round(bar * 1000);
  if (difference % 2) return null;
  const sizes = new Map<number, number>();
  for (const plate of inventory)
    sizes.set(plate.weight, (sizes.get(plate.weight) ?? 0) + plate.count);
  const plates = [...sizes]
    .map(([weight, count]) => ({ weight, count }))
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.weight - a.weight);
  const failed = new Set<string>();
  let visits = 0;
  function solve(index: number, remaining: number): LoadedPlate[] | null {
    if (remaining === 0) return [];
    if (index === plates.length) return null;
    const key = `${index}:${remaining}`;
    if (failed.has(key)) return null;
    if (++visits > 100000)
      throw new Error(
        "Inventory search limit reached. Reduce the number of custom plate sizes.",
      );
    if (
      plates
        .slice(index)
        .reduce(
          (sum, p) =>
            sum + Math.round(p.weight * 1000) * Math.floor(p.count / 2),
          0,
        ) < remaining
    )
      return null;
    const plate = plates[index],
      size = Math.round(plate.weight * 1000);
    const maximum = Math.min(
      Math.floor(plate.count / 2),
      Math.floor(remaining / size),
    );
    for (let count = maximum; count >= 0; count--) {
      const next = solve(index + 1, remaining - count * size);
      if (next !== null)
        return count
          ? [{ weight: plate.weight, perSide: count }, ...next]
          : next;
    }
    failed.add(key);
    return null;
  }
  return solve(0, difference / 2);
}
