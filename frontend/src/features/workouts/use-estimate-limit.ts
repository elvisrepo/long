import { useState } from "react";
export function useEstimateLimit(exerciseId = "") {
  const key = `longevity-estimate-rep-limit:${exerciseId}`;
  const [limit, setLimit] = useState(() => {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isInteger(value) && value >= 1 && value <= 30 ? value : 10;
    } catch {
      return 10;
    }
  });
  return [
    limit,
    (value: number) => {
      if (!Number.isInteger(value) || value < 1 || value > 30) return;
      setLimit(value);
      try {
        localStorage.setItem(key, String(value));
      } catch {
        /* Device storage is optional. */
      }
    },
  ] as const;
}
