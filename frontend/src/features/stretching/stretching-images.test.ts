import { describe, expect, it } from "vitest";

import { exerciseImages } from "./stretching-images";

const curatedExerciseSlugs = [
  "lower-body-lunge-stretch",
  "lower-body-hip-circuit",
  "lower-body-glute-bridges",
  "lower-body-cook-hip-lift",
  "lower-body-clam",
  "lower-body-half-squat-half-deadlift",
  "lower-body-cat-and-camel-stretch",
  "lower-body-dead-bug",
  "lower-body-plank",
  "lower-body-foam-rolling",
  "upper-body-foam-rolling-thoracic-spine",
  "upper-body-extending-thoracic-spine",
  "upper-body-extending-thoracic-spine-bench",
  "upper-body-wall-pec-stretch",
  "upper-body-lats-stretch",
  "upper-body-shoulder-stretch",
  "upper-body-shoulder-dislocations",
  "upper-body-scapular-wall-slide",
  "upper-body-chin-tuck",
  "upper-body-reverse-crunch",
];

describe("stretching exercise image assets", () => {
  it("maps each curated exercise slug to a bundled image", () => {
    expect(Object.keys(exerciseImages).sort()).toEqual(
      curatedExerciseSlugs.sort(),
    );
    expect(Object.values(exerciseImages).every(Boolean)).toBe(true);
  });
});
