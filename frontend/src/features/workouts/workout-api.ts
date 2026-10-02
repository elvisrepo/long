import { getAccessToken } from "../auth/auth-session";

export type TrackingType = "strength" | "bodyweight" | "duration" | "cardio";
export interface ExerciseCategory {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}
export interface Exercise extends ExerciseCategory {
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
): Promise<Workout[]> {
  const rows: Workout[] = [];
  let offset = 0;
  while (true) {
    const page = await getWorkoutPage(from, to, offset);
    rows.push(...page.results);
    if (!page.next) return rows;
    if (!page.results.length)
      throw new Error("Workout history could not be fully loaded.");
    offset += page.results.length;
  }
}
export const getWorkout = (id: string): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(id)}/`);
export const createWorkout = (performed_on: string): Promise<Workout> =>
  request("sessions/", "POST", { performed_on });
export const updateWorkout = (
  id: string,
  data: Partial<
    Pick<Workout, "performed_on" | "name" | "notes" | "is_finished">
  >,
): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(id)}/`, "PATCH", data);
export const copyWorkout = (
  id: string,
  performed_on: string,
): Promise<Workout> =>
  request(`sessions/${encodeURIComponent(id)}/copy/`, "POST", { performed_on });
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
): Promise<WorkoutExercise> {
  return request(`session-exercises/${encodeURIComponent(id)}/`, "PATCH", {
    display_order,
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
): Promise<Workout> =>
  request(`routine-days/${encodeURIComponent(id)}/start/`, "POST", {
    performed_on,
  });
export const removeRoutineDay = (id: string): Promise<void> =>
  request(`routine-days/${encodeURIComponent(id)}/`, "DELETE");
