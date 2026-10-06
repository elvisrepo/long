import type { GoalDefinition, GoalType, TrackingType } from "./workout-api";
import { formatProgressValue } from "./workout-analysis";

export const goalChoices: Record<GoalType, string> = {
  strength: "Weight and reps",
  reps: "Reps in one set",
  distance: "Distance in one set",
  duration: "Duration in one set (at least)",
  max_speed: "Speed (at least)",
  best_pace: "Pace (at most / faster)",
  distance_time: "Distance within a time limit",
};
export function goalTypesFor(type: TrackingType): GoalType[] {
  return {
    strength: ["strength"],
    bodyweight: ["reps"],
    cardio: ["distance", "duration", "max_speed", "best_pace", "distance_time"],
    duration: ["duration"],
  }[type] as GoalType[];
}
export function goalUnit(
  goal: Pick<GoalDefinition, "goal_type" | "distance_unit">,
): string {
  return {
    reps: "reps",
    distance: goal.distance_unit,
    duration: "sec",
    max_speed: `${goal.distance_unit}/h`,
    best_pace: `min/${goal.distance_unit}`,
    strength: "",
    distance_time: goal.distance_unit,
  }[goal.goal_type ?? "strength"];
}
export function goalValue(
  goal: Pick<GoalDefinition, "goal_type" | "distance_unit">,
  value: string,
): string {
  return formatProgressValue(Number(Number(value).toFixed(3)), goalUnit(goal));
}
export function goalTitle(goal: GoalDefinition): string {
  if (goal.goal_type === "distance_time")
    return `At least ${Number(goal.target_distance)} ${goal.distance_unit} within ${goalTime(goal.target_duration_seconds!)} in one set`;
  if (!goal.goal_type || goal.goal_type === "strength")
    return `${Number(goal.target_weight)} ${goal.weight_unit} × ${goal.rep_rule === "exact" ? "exactly" : "at least"} ${goal.target_reps} reps`;
  return `${goal.goal_type === "best_pace" ? "At most" : "At least"} ${goalValue(goal, goal.target_value!)} in one set`;
}

export function goalTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  return `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ""}`;
}
