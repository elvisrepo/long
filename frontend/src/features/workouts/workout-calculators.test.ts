import { expect, it } from "vitest";
import { estimatedMax, percentageLoad, plateLoad } from "./workout-calculators";

it("labels an Epley estimate with a one-rep special case and bounded inputs", () => {
  expect(estimatedMax(100, 5)).toBeCloseTo(116.666666);
  expect(estimatedMax(100, 1)).toBe(100);
  expect(() => estimatedMax(0, 5)).toThrow();
  expect(() => estimatedMax(100, 31)).toThrow();
});

it("finds exact balanced plates from finite inventory, including non-greedy combinations", () => {
  expect(plateLoad(100, 20, [{ weight: 20, count: 4 }])).toEqual([
    { weight: 20, perSide: 2 },
  ]);
  expect(
    plateLoad(12, 0, [
      { weight: 4, count: 2 },
      { weight: 3, count: 4 },
    ]),
  ).toEqual([{ weight: 3, perSide: 2 }]);
  expect(plateLoad(20, 20, [])).toEqual([]);
  expect(plateLoad(100, 20, [{ weight: 20, count: 3 }])).toBeNull();
  expect(plateLoad(22.5, 20, [{ weight: 1.25, count: 2 }])).toEqual([
    { weight: 1.25, perSide: 1 },
  ]);
  expect(() => plateLoad(10, 20, [])).toThrow();
});

it("rounds a percentage calculation to an explicit increment without floating artifacts", () => {
  expect(percentageLoad(100, 80, 2.5)).toBe(80);
  expect(percentageLoad(117, 80, 2.5)).toBe(92.5);
  expect(percentageLoad(1, 65, 0.1)).toBe(0.7);
  expect(() => percentageLoad(100, 0, 2.5)).toThrow();
  expect(() => percentageLoad(100, 80, 0)).toThrow();
});

it("combines duplicate plate sizes before pairing the finite inventory", () => {
  expect(
    plateLoad(40, 0, [
      { weight: 20, count: 1 },
      { weight: 20, count: 1 },
    ]),
  ).toEqual([{ weight: 20, perSide: 1 }]);
});
