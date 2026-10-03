import { getAccessToken } from "../auth/auth-session";

export type TrackingType = "strength" | "bodyweight" | "duration" | "cardio";
export interface ExerciseCategory {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}
export interface Exercise extends ExerciseCategory {
  is_favorite?: boolean;
  default_graph?: string;
  trained_session_count?: number;
  last_used_on?: string | null;
  category_id: string;
  tracking_type: TrackingType;
  weight_unit: "kg" | "lb";
  distance_unit: "km" | "mi";
  notes: string;
  weight_increment: string;
  rest_seconds: number;
}
export interface WorkoutCatalog {
  categories: ExerciseCategory[];
  exercises: Exercise[];
  preferences?: WorkoutPreferences;
}
export interface WorkoutPreferences {
  auto_start_rest?: boolean;
  auto_advance_groups?: boolean;
  bar_kg?: string;
  bar_lb?: string;
  plates_kg?: { weight: string; count: number }[];
  plates_lb?: { weight: string; count: number }[];
}
export interface WorkoutSet {
  id: string;
  display_order: number;
  weight: string | null;
  reps: number | null;
  distance: string | null;
  duration_seconds: number | null;
  comment: string;
  is_completed: boolean;
}
export interface WorkoutExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  group_name?: string;
  group_colour?: string;
  category_name: string;
  tracking_type: TrackingType;
  weight_unit: "kg" | "lb";
  distance_unit: "km" | "mi";
  display_order: number;
  sets: WorkoutSet[];
}
export interface Workout {
  id: string;
  performed_on: string;
  name: string;
  notes: string;
  is_finished: boolean;
  created_at: string;
  completed_set_count: number;
  exercises: WorkoutExercise[];
}
export interface WorkoutPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Workout[];
}
export interface RecordSource {
  workout_id: string;
  item_id: string;
  set_id: string;
  weight: string | null;
  reps: number | null;
}
export interface ProgressPointRow {
  date: string;
  value: string;
  tracking_type: TrackingType;
  weight_unit: "kg" | "lb";
  distance_unit: "km" | "mi";
  source: RecordSource | null;
  session?: string;
  workout_id?: string;
}
export interface PersonalRecordRow extends ProgressPointRow {
  reps: number;
  source: RecordSource;
}
export interface SummaryPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
  types?: TrackingType[];
}
export type RoutineSet = Omit<WorkoutSet, "comment" | "is_completed">;
export interface RoutineExercise extends Omit<WorkoutExercise, "sets"> {
  sets: RoutineSet[];
}
export interface RoutineDay {
  id: string;
  name: string;
  notes: string;
  display_order: number;
  exercises: RoutineExercise[];
}
export interface WorkoutRoutine {
  id: string;
  name: string;
  notes: string;
  display_order: number;
  is_active: boolean;
  days: RoutineDay[];
}
export interface RoutineStartPreview {
  day_id: string;
  name: string;
  notes: string;
  performed_on: string;
  carry_forward: boolean;
  preview_token: string;
  exercises: (Omit<RoutineExercise, "sets"> & {
    carry_reason: string;
    sets: (RoutineSet & {
      source: null | {
        workout_id: string;
        item_id: string;
        set_id: string;
        date: string;
        fields: string[];
      };
    })[];
  })[];
}
export type SetInput = Partial<Omit<WorkoutSet, "id">>;
export type ExerciseInput = Partial<Omit<Exercise, "id">>;

function message(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(message).join(" ");
  if (data && typeof data === "object")
    return Object.entries(data)
      .map(
        ([key, value]) =>
          `${key === "detail" ? "" : key + ": "}${message(value)}`,
      )
      .join(" ");
  return "Workout request failed. Please try again.";
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error("Authentication required");
  const response = await fetch(`/api/v1/workouts/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(message(await response.json().catch(() => null)));
  return response.status === 204 ? (undefined as T) : response.json();
}
export const getWorkoutCatalog = (): Promise<WorkoutCatalog> =>
  request("catalog/");
export interface ExerciseStatistics {
  exercise_id: string;
  date_to: string;
  groups: {
    tracking_type: TrackingType;
    weight_unit: "kg" | "lb";
    distance_unit: "km" | "mi";
    session_count: number;
    set_count: number;
    reps_total: number | null;
    volume_total: string | null;
    distance_total: string | null;
    duration_seconds_total: number | null;
    first_date: string;
    last_date: string;
  }[];
}
export interface GoalDefinition {
  id: string;
  target_weight: string;
  target_reps: number;
  rep_rule: "at_least" | "exact";
  weight_unit: "kg" | "lb";
  distance_unit: "km" | "mi";
  created_at: string;
}
export interface ExerciseGoal extends GoalDefinition {
  achieved: boolean;
  best_weight: string | null;
  progress_percent: string;
  source: RecordSource | null;
  source_date: string | null;
}
export const getExerciseGoals = (
  exercise: string,
  date: string,
): Promise<ExerciseGoal[]> =>
  request(
    `exercises/${encodeURIComponent(exercise)}/goals/?${new URLSearchParams({ date_to: date })}`,
  );
export type GoalInput = Pick<
  GoalDefinition,
  "target_weight" | "target_reps" | "rep_rule"
>;
export const saveExerciseGoal = (
  exercise: string,
  id: string | undefined,
  data: GoalInput,
): Promise<GoalDefinition> =>
  request(
    id
      ? `goals/${encodeURIComponent(id)}/`
      : `exercises/${encodeURIComponent(exercise)}/goals/`,
    id ? "PATCH" : "POST",
    data,
  );
export const deleteExerciseGoal = (id: string): Promise<void> =>
  request(`goals/${encodeURIComponent(id)}/`, "DELETE");
export const getExerciseStats = (
  exercise: string,
  date: string,
): Promise<ExerciseStatistics> =>
  request(
    `exercises/${encodeURIComponent(exercise)}/stats/?${new URLSearchParams({ date_to: date })}`,
  );
export const saveWorkoutPreferences = (
  data: WorkoutPreferences,
): Promise<WorkoutPreferences> => request("preferences/", "PATCH", data);
export function getProgressPage(
  exercise: string,
  date: string,
  metric: string,
  reps = 5,
  offset = 0,
): Promise<SummaryPage<ProgressPointRow>> {
  const query = new URLSearchParams({
    date_to: date,
    metric,
    reps: String(reps),
    limit: "500",
    offset: String(offset),
  });
  return request(
    `exercises/${encodeURIComponent(exercise)}/progress/?${query}`,
  );
}
export function getRecordPage(
  exercise: string,
  date: string,
  offset = 0,
  history?: { reps: number; weight_unit: string; distance_unit: string },
): Promise<SummaryPage<PersonalRecordRow>> {
  const query = new URLSearchParams({
    date_to: date,
    limit: history ? "25" : "500",
    offset: String(offset),
  });
  if (history) {
    query.set("history", "true");
    query.set("reps", String(history.reps));
    query.set("weight_unit", history.weight_unit);
    query.set("distance_unit", history.distance_unit);
  }
  return request(`exercises/${encodeURIComponent(exercise)}/records/?${query}`);
}
export const initializeWorkoutCatalog = (): Promise<WorkoutCatalog> =>
  request("catalog/initialize/", "POST", {});
export function getWorkoutPage(
  from: string,
  to: string,
  offset = 0,
  exercise?: string,
): Promise<WorkoutPage> {
  const query = new URLSearchParams({
    date_from: from,
    date_to: to,
    limit: "100",
    offset: String(offset),
  });
  if (exercise) query.set("exercise_id", exercise);
  return request(`sessions/?${query}`);
}
export async function getWorkoutRange(
  from: string,
  to: string,
  exercise?: string,
): Promise<Workout[]> {
  const rows: Workout[] = [];
  let offset = 0;
  while (true) {
    const page = await getWorkoutPage(from, to, offset, exercise);
    rows.push(...page.results);
    if (!page.next) return rows;
    if (!page.results.length)
      throw new Error("Workout history could not be fully loaded.");
    offset += page.results.length;
  }
}
export const getWorkout = (id: string): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(id)}/`);
export interface GroupInput {
  name: string;
  colour: string;
  original_name?: string;
  member_ids: string[];
  add_exercise_ids: string[];
}
export const saveWorkoutGroup = (
  session: string,
  data: GroupInput,
): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(session)}/groups/`, "PUT", data);
export const deleteWorkoutGroup = (
  session: string,
  name: string,
): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(session)}/groups/`, "DELETE", {
    name,
  });
export const createWorkout = (performed_on: string): Promise<Workout> =>
  request("sessions/", "POST", { performed_on });
export const updateWorkout = (
  id: string,
  data: Partial<
    Pick<Workout, "performed_on" | "name" | "notes" | "is_finished">
  >,
): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(id)}/`, "PATCH", data);
export interface CopySelection {
  item_id: string;
  set_ids?: string[];
}
export const copyWorkout = (
  id: string,
  performed_on: string,
  selection?: CopySelection[],
): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(id)}/copy/`, "POST", {
    performed_on,
    ...(selection === undefined ? {} : { selection }),
  });
export const addWorkoutExercise = (
  session: string,
  exercise_id: string,
): Promise<WorkoutExercise> =>
  request(`sessions/${encodeURIComponent(session)}/exercises/`, "POST", {
    exercise_id,
  });
export function saveWorkoutSet(
  item: string,
  id: string | undefined,
  data: SetInput,
): Promise<WorkoutSet> {
  return request(
    id
      ? `sets/${encodeURIComponent(id)}/`
      : `session-exercises/${encodeURIComponent(item)}/sets/`,
    id ? "PATCH" : "POST",
    data,
  );
}
export function saveCategory(
  id: string | undefined,
  data: Partial<Omit<ExerciseCategory, "id">>,
): Promise<ExerciseCategory> {
  return request(
    `categories/${id ? encodeURIComponent(id) + "/" : ""}`,
    id ? "PATCH" : "POST",
    data,
  );
}
export function saveExercise(
  id: string | undefined,
  data: ExerciseInput,
): Promise<Exercise> {
  return request(
    `exercises/${id ? encodeURIComponent(id) + "/" : ""}`,
    id ? "PATCH" : "POST",
    data,
  );
}
export function deleteWorkoutItem(
  kind: "sessions" | "session-exercises" | "sets",
  id: string,
): Promise<void> {
  return request(`${kind}/${encodeURIComponent(id)}/`, "DELETE");
}
export function reorderWorkoutExercise(
  id: string,
  display_order: number,
  group_name?: string,
): Promise<WorkoutExercise> {
  return request(`session-exercises/${encodeURIComponent(id)}/`, "PATCH", {
    display_order,
    ...(group_name === undefined ? {} : { group_name }),
  });
}

export function moveWorkoutItem(
  kind: "session-exercises" | "sets",
  id: string,
  direction: "up" | "down",
): Promise<Workout> {
  return request(`${kind}/${encodeURIComponent(id)}/move/`, "POST", {
    direction,
  });
}

export const getWorkoutRoutines = (): Promise<WorkoutRoutine[]> =>
  request("routines/");
export const saveWorkoutRoutine = (
  id: string | undefined,
  data: Partial<Omit<WorkoutRoutine, "id" | "days">>,
): Promise<WorkoutRoutine> =>
  request(
    `routines/${id ? encodeURIComponent(id) + "/" : ""}`,
    id ? "PATCH" : "POST",
    data,
  );
export const saveRoutineDay = (
  routineId: string,
  id: string | undefined,
  data: {
    name?: string;
    notes?: string;
    display_order?: number;
    source_workout_id?: string;
  },
): Promise<RoutineDay> =>
  request(
    id
      ? `routine-days/${encodeURIComponent(id)}/`
      : `routines/${encodeURIComponent(routineId)}/days/`,
    id ? "PATCH" : "POST",
    data,
  );
export const startRoutineDay = (
  id: string,
  performed_on: string,
  options?: {
    carry_forward?: boolean;
    preview_token?: string;
    selection?: CopySelection[];
  },
): Promise<Workout> =>
  request(`routine-days/${encodeURIComponent(id)}/start/`, "POST", {
    performed_on,
    ...options,
  });
export const getRoutineStartPreview = (
  id: string,
  performed_on: string,
  carry_forward: boolean,
): Promise<RoutineStartPreview> =>
  request(
    `routine-days/${encodeURIComponent(id)}/preview/?${new URLSearchParams({ performed_on, carry_forward: String(carry_forward) })}`,
  );
export const removeRoutineDay = (id: string): Promise<void> =>
  request(`routine-days/${encodeURIComponent(id)}/`, "DELETE");

export const addRoutineExercise = (
  day: string,
  exercise_id: string,
): Promise<RoutineExercise> =>
  request(`routine-days/${encodeURIComponent(day)}/exercises/`, "POST", {
    exercise_id,
  });
export const reorderRoutineExercise = (
  id: string,
  display_order: number,
  group_name?: string,
): Promise<RoutineExercise> =>
  request(`routine-exercises/${encodeURIComponent(id)}/`, "PATCH", {
    display_order,
    ...(group_name === undefined ? {} : { group_name }),
  });
export const saveRoutineSet = (
  item: string,
  id: string | undefined,
  data: Partial<Omit<RoutineSet, "id">>,
): Promise<RoutineSet> =>
  request(
    id
      ? `routine-sets/${encodeURIComponent(id)}/`
      : `routine-exercises/${encodeURIComponent(item)}/sets/`,
    id ? "PATCH" : "POST",
    data,
  );
export const removeRoutineItem = (
  kind: "routine-exercises" | "routine-sets",
  id: string,
): Promise<void> => request(`${kind}/${encodeURIComponent(id)}/`, "DELETE");
