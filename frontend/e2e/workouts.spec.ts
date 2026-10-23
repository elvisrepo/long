import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type {
  WorkoutRoutine,
  WorkoutPreferences,
} from "../src/features/workouts/workout-api";

const categoryId = "11111111-1111-4111-8111-111111111111";
const exerciseId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";
const date = "2026-10-02";

async function fixture(page: Page, preferences: WorkoutPreferences = {}) {
  const category = {
    id: categoryId,
    name: "Chest",
    display_order: 10,
    is_active: true,
  };
  const exercise = {
    ...category,
    id: exerciseId,
    category_id: categoryId,
    name: "Barbell bench press",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    notes: "",
    weight_increment: "2.500",
    rest_seconds: 90,
  };
  type SetRow = {
    id: string;
    weight: string | null;
    reps: number | null;
    distance: null;
    duration_seconds: null;
    comment: string;
    display_order: number;
    is_completed: boolean;
  };
  const occurrence = {
    id: itemId,
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    category_name: category.name,
    tracking_type: exercise.tracking_type,
    weight_unit: "kg",
    distance_unit: "km",
    display_order: 10,
    sets: [] as SetRow[],
  };
  const sessions: {
    id: string;
    performed_on: string;
    name: string;
    notes: string;
    is_finished: boolean;
    created_at: string;
    completed_set_count: number;
    exercises: (typeof occurrence)[];
  }[] = [];
  const routines: WorkoutRoutine[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON() as Record<string, unknown> | null;
    let json: unknown = {};
    if (path.endsWith("/refresh/")) json = { access: "workout-fixture" };
    else if (path.endsWith("/me/")) json = { email: "workout@example.test" };
    else if (path.includes("/workouts/catalog/"))
      json = { categories: [category], exercises: [exercise], preferences };
    else if (path.endsWith("/workouts/preferences/")) {
      if (method === "PATCH") Object.assign(preferences, body);
      json = preferences;
    } else if (path === "/api/v1/workouts/routines/") {
      if (method === "POST") {
        const routine: WorkoutRoutine = {
          id: "88888888-8888-4888-8888-888888888888",
          name: String(body?.name),
          notes: "",
          display_order: 100,
          is_active: true,
          days: [],
        };
        routines.push(routine);
        json = routine;
      } else json = routines;
    } else if (
      path.includes("/workouts/routines/") &&
      path.endsWith("/days/")
    ) {
      const source = sessions.find((w) => w.id === body?.source_workout_id)!;
      const day = {
        id: "99999999-9999-4999-8999-999999999999",
        name: String(body?.name),
        notes: String(body?.notes || ""),
        display_order: Number(body?.display_order ?? 100),
        exercises: structuredClone(source.exercises).map((i) => ({
          ...i,
          sets: i.sets.map((s) => ({
            id: s.id,
            weight: s.weight,
            reps: s.reps,
            distance: s.distance,
            duration_seconds: s.duration_seconds,
            display_order: s.display_order,
          })),
        })),
      };
      routines[0].days.push(day);
      json = day;
    } else if (path.includes("/workouts/routines/")) {
      Object.assign(routines[0], body);
      json = routines[0];
    } else if (
      path.includes("/workouts/routine-days/") &&
      path.endsWith("/preview/")
    ) {
      const day = routines[0].days[0];
      json = {
        day_id: day.id,
        name: routines[0].name + " · " + day.name,
        notes: day.notes,
        performed_on: url.searchParams.get("performed_on"),
        carry_forward: false,
        preview_token: "a".repeat(64),
        exercises: day.exercises.map((item) => ({
          ...item,
          carry_reason: "Fixed template values; carry-forward is off.",
          sets: item.sets.map((row) => ({ ...row, source: null })),
        })),
      };
    } else if (
      path.includes("/workouts/routine-days/") &&
      path.endsWith("/start/")
    ) {
      const day = routines[0].days[0];
      const planned = {
        ...sessions[0],
        id: "77777777-7777-4777-8777-777777777777",
        name: routines[0].name + " · " + day.name,
        performed_on: String(body?.performed_on),
        notes: day.notes,
        is_finished: false,
        completed_set_count: 0,
        exercises: day.exercises.map((i) => ({
          ...i,
          sets: i.sets.map((s) => ({ ...s, comment: "", is_completed: false })),
        })),
      };
      sessions.push(planned);
      json = planned;
    } else if (path.includes("/workouts/routine-days/")) {
      if (method === "DELETE") {
        routines[0].days = [];
        await route.fulfill({ status: 204 });
        return;
      }
      Object.assign(routines[0].days[0], body);
      json = routines[0].days[0];
    } else if (path === "/api/v1/workouts/sessions/" && method === "GET") {
      const rows = sessions.filter(
        (w) =>
          w.performed_on >= url.searchParams.get("date_from")! &&
          w.performed_on <= url.searchParams.get("date_to")!,
      );
      json = { count: rows.length, next: null, previous: null, results: rows };
    } else if (path === "/api/v1/workouts/sessions/" && method === "POST") {
      const session = {
        id: sessionId,
        performed_on: String(body?.performed_on),
        name: "Workout",
        notes: "",
        is_finished: false,
        created_at: date + "T10:00:00Z",
        completed_set_count: 0,
        exercises: [] as (typeof occurrence)[],
      };
      sessions.push(session);
      json = session;
    } else if (path.endsWith(`/${sessionId}/exercises/`)) {
      sessions[0].exercises.push(occurrence);
      json = occurrence;
    } else if (path.endsWith(`/${sessionId}/copy/`)) {
      const copied = {
        ...sessions[0],
        id: "55555555-5555-4555-8555-555555555555",
        performed_on: String(body?.performed_on),
        is_finished: false,
        completed_set_count: 0,
        exercises: sessions[0].exercises.map((i) => ({
          ...i,
          sets: i.sets.map((s) => ({ ...s, is_completed: false, comment: "" })),
        })),
      };
      sessions.push(copied);
      json = copied;
    } else if (path.endsWith(`/${sessionId}/`)) {
      if (method === "PATCH") Object.assign(sessions[0], body);
      json = sessions[0];
    } else if (path.endsWith(`/${itemId}/sets/`)) {
      const set = {
        id:
          "66666666-6666-4666-8666-" +
          String(occurrence.sets.length + 1).padStart(12, "0"),
        weight: null,
        reps: null,
        distance: null,
        duration_seconds: null,
        comment: "",
        display_order: occurrence.sets.length * 10,
        is_completed: true,
        ...body,
      } as SetRow;
      occurrence.sets.push(set);
      json = set;
    } else if (path.includes("/workouts/sets/")) {
      const id = path.split("/").at(-2);
      const set = occurrence.sets.find((s) => s.id === id)!;
      if (method === "DELETE") {
        occurrence.sets = occurrence.sets.filter((s) => s.id !== id);
        await route.fulfill({ status: 204 });
        return;
      }
      Object.assign(set, body);
      json = set;
    } else if (path.endsWith("/definitions/")) json = [];
    else if (path.endsWith("/current/"))
      json = { plan: { code: "free", name: "Free" }, status: "active" };
    else if (!path.endsWith("/csrf/")) {
      await route.fulfill({
        status: 404,
        json: { detail: "Unhandled fixture: " + path },
      });
      return;
    }
    for (const session of sessions)
      session.completed_set_count = session.exercises.reduce(
        (sum, i) => sum + i.sets.filter((s) => s.is_completed).length,
        0,
      );
    await route.fulfill({ json });
  });
  return { category, exercise };
}

test("category colours and manual drag order persist without saving cancelled drafts", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("longevity-theme", "light"),
  );
  const { category, exercise } = await fixture(page);
  let categories = [
    { ...category, display_order: 10, colour: "#c73b32" },
    {
      ...category,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Back",
      display_order: 20,
      colour: "#2785b4",
    },
    {
      ...category,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Legs",
      display_order: 30,
      colour: "#46a5ad",
    },
  ];
  let mode = "alphabetical";
  let writes = 0;
  const catalog = () => ({
    categories,
    exercises: [exercise],
    preferences: { category_order: mode },
  });
  await page.route("**/api/v1/workouts/catalog/", (route) =>
    route.fulfill({ json: catalog() }),
  );
  await page.route("**/api/v1/workouts/categories/reorder/", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.expected_order).toEqual(categories.map((row) => row.id));
    mode = body.mode;
    if (mode === "manual")
      categories = body.category_ids.map((id: string, index: number) => ({
        ...categories.find((row) => row.id === id)!,
        display_order: (index + 1) * 10,
      }));
    writes += 1;
    await route.fulfill({ json: catalog() });
  });
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/workouts?view=exercises&date=" + date);
  const headings = page.locator(".workout-library-category h2");
  await expect(headings).toHaveText(["Back", "Chest", "Legs"]);
  await page.getByRole("button", { name: "Display options" }).click();
  await page.getByRole("checkbox", { name: "Category colours" }).check();
  await expect(
    page.getByRole("img", { name: "Chest category colour" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reorder categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Reorder categories" });
  await dialog.getByRole("radio", { name: "Manual" }).check();
  const source = await dialog
    .getByRole("button", { name: "Drag Legs" })
    .boundingBox();
  const target = await dialog
    .getByRole("button", { name: "Drag Chest" })
    .boundingBox();
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(dialog.locator("li > span")).toHaveText([
    "Legs",
    "Chest",
    "Back",
  ]);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.screenshot({
      path: `/tmp/category-reorder-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(headings).toHaveText(["Legs", "Chest", "Back"]);
  await page.reload();
  await expect(headings).toHaveText(["Legs", "Chest", "Back"]);
  await expect(
    page.getByRole("img", { name: "Chest category colour" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Display options" }).click();
  await page.getByRole("button", { name: "Reorder categories" }).click();
  await dialog.getByRole("button", { name: "Move Back up" }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toBe(1);
  await expect(headings).toHaveText(["Legs", "Chest", "Back"]);
  await page.getByRole("button", { name: "Display options" }).click();
  await page.getByRole("button", { name: "Reorder categories" }).click();
  await dialog.getByRole("radio", { name: "Alphabetical" }).check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(headings).toHaveText(["Back", "Chest", "Legs"]);
  await page.route("**/api/v1/workouts/sessions/**", async (route) => {
    if (
      new URL(route.request().url()).pathname !== "/api/v1/workouts/sessions/"
    )
      return route.fallback();
    await route.fulfill({
      json: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: sessionId,
            performed_on: date,
            name: "Training",
            notes: "",
            is_finished: true,
            created_at: date + "T10:00:00Z",
            completed_set_count: 1,
            exercises: [
              {
                id: itemId,
                exercise_id: exerciseId,
                exercise_name: exercise.name,
                category_name: "Chest",
                tracking_type: "strength",
                weight_unit: "kg",
                distance_unit: "km",
                sets: [
                  {
                    id: "completed",
                    weight: "60.000",
                    reps: 5,
                    is_completed: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByTitle("Chest category")).toHaveCSS(
    "background-color",
    "rgb(199, 59, 50)",
  );
  await page.setViewportSize({ width: 320, height: 950 });
  await page.screenshot({
    path: "/tmp/category-calendar-320.png",
    fullPage: true,
  });
});

test("deletes only an eligible library exercise after confirmation", async ({
  page,
}) => {
  const { category, exercise } = await fixture(page);
  let deletions = 0;
  await page.route("**/api/v1/workouts/catalog/", (route) =>
    route.fulfill({
      json: {
        categories: [category],
        exercises: deletions ? [] : [{ ...exercise, can_delete: true }],
      },
    }),
  );
  await page.route(
    `**/api/v1/workouts/exercises/${exerciseId}/`,
    async (route) => {
      expect(route.request().method()).toBe("DELETE");
      deletions += 1;
      await route.fulfill({ status: 204 });
    },
  );
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/workouts?view=exercises&date=" + date);
  const trigger = page.getByRole("button", {
    name: "Actions for Barbell bench press",
  });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Delete Barbell bench press?",
  });
  await expect(dialog).toContainText("permanent");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deletions).toBe(0);
  await trigger.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete exercise", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Barbell bench press", exact: true }),
  ).toHaveCount(0);
  expect(deletions).toBe(1);
});

test("exercise display options persist while category and exercise editing stay distinct", async ({
  page,
}) => {
  const { exercise } = await fixture(page);
  Object.assign(exercise, { trained_session_count: 3, last_used_on: date });
  await page.addInitScript(() =>
    localStorage.setItem("longevity-theme", "light"),
  );
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/workouts?view=exercises&date=" + date);
  const row = page.getByRole("button", {
    name: "View Barbell bench press",
    exact: true,
  });
  await expect(row).not.toContainText("workouts");
  await expect(row).not.toContainText("Weight + reps");
  const category = page.getByRole("button", { name: "Edit category Chest" });
  await expect(category).toHaveText("Edit category");
  await category.click();
  await expect(
    page.getByRole("heading", { name: "Edit category", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Display options" }).click();
  await page.getByRole("checkbox", { name: "Workout count" }).check();
  await page.getByRole("checkbox", { name: "Last used", exact: true }).check();
  const options = page.getByRole("group", { name: "Exercise details" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(options).toBeVisible();
    const bounds = await options.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `/tmp/exercise-display-options-${width}.png`,
      fullPage: true,
    });
  }
  await page.keyboard.press("Escape");
  await expect(row).toContainText("3 workouts · Last used");
  await page.reload();
  await expect(row).toContainText("3 workouts · Last used");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.screenshot({
      path: `/tmp/exercise-library-details-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Display options" }).click();
  await page.getByRole("checkbox", { name: "Workout count" }).uncheck();
  await page.keyboard.press("Escape");
  await expect(row).toContainText("Last used");
  await expect(row).not.toContainText("3 workouts");
});

test("exercise library keeps compact actions usable at phone and desktop widths", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("longevity-theme", "light"),
  );
  await fixture(page);
  await page.goto("/workouts?view=exercises&date=" + date);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    const trigger = page.getByRole("button", {
      name: "Actions for Barbell bench press",
    });
    await trigger.click();
    const menu = page.getByRole("menu", {
      name: "Actions for Barbell bench press",
    });
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused();
    await page.screenshot({
      path: `/tmp/exercise-library-menu-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(menu).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Actions for Barbell bench press" })
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit exercise" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Actions for Barbell bench press" })
    .click();
  await page.getByRole("menuitem", { name: "History" }).click();
  await expect(page).toHaveURL(/view=history/);
});

for (const width of [320, 390, 1440])
  test(`workout logging, planning, editing, copy and layout at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await fixture(page);
    await page.goto("/workouts?date=" + date);
    await expect(
      page.getByRole("heading", {
        name: "No workout on this day",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start new workout" }).click();
    await page.getByRole("button", { name: "Add Barbell bench press" }).click();

    await page.getByLabel("Weight (kg)", { exact: true }).fill("60");
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page.getByLabel("Exercise options", { exact: true }).click();
    await page.getByText("+ Comment", { exact: true }).click();
    await page.getByLabel("Set comment").fill("Steady pace");
    await page.getByRole("button", { name: "Close menu", exact: true }).click();
    await page.getByRole("button", { name: "Save completed set" }).click();
    await expect(
      page
        .getByRole("button", { name: "Edit set 1", exact: true })
        .locator(".workout-strength-values"),
    ).toHaveText(/60\s*kg8\s*reps/);
    await page.getByRole("button", { name: "Edit set 1" }).click();
    await page.getByLabel("Weight (kg)", { exact: true }).fill("65");
    await page.getByRole("button", { name: "Update set" }).click();
    await expect(
      page
        .getByRole("button", { name: "Edit set 1", exact: true })
        .locator(".workout-strength-values"),
    ).toHaveText(/65\s*kg8\s*reps/);
    await page.getByLabel("Weight (kg)", { exact: true }).fill("");
    await page.getByLabel("Reps", { exact: true }).fill("");
    await page.getByLabel("Exercise options", { exact: true }).click();
    await page.getByRole("button", { name: "Add planned set" }).click();
    await expect(page.getByLabel("Set 2 completed")).not.toBeChecked();
    await page.getByRole("button", { name: "Edit set 2" }).click();
    await page.getByRole("button", { name: "Delete set", exact: true }).click();
    await page.getByRole("button", { name: "Confirm set deletion" }).click();
    await expect(page.getByLabel("Set 2 completed")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workouts/training-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Exercise options", { exact: true }).click();
    await page.getByRole("button", { name: "Workout overview" }).click();
    await page.getByText("More actions ···", { exact: true }).click();
    await page.getByRole("button", { name: "Finish workout" }).click();
    await page.getByText("More actions ···", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reopen workout" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Export workout" }).click();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      }),
    );
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Share to", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "WhatsApp", exact: true }),
    ).toHaveAttribute("href", /wa\.me/);
    await expect(
      page.getByRole("link", { name: "Gmail", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Email", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Select all", exact: true }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await expect(page.getByLabel("Workout summary")).toContainText("65");
    await expect(page.getByLabel("Workout summary")).not.toContainText(
      "Steady pace",
    );
    await page.getByLabel("Include session notes and set comments").check();
    await expect(page.getByLabel("Workout summary")).toContainText(
      "Steady pace",
    );
    await page.getByLabel("Format", { exact: true }).selectOption("csv");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`longevity-workout-${date}.csv`);
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv).toContain('"65","kg","8"');
    expect(csv).toContain('"Completed","Steady pace"');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/workouts/export-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Copy workout" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Copy to date").fill("2026-10-03");
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Open Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("More actions ···", { exact: true }).click();
    await page
      .getByRole("button", { name: "Manage workout", exact: true })
      .click();
    await page.getByRole("button", { name: "Save as routine day" }).click();
    await page.getByLabel("New routine name").fill("Weekly plan");
    await page.getByLabel("Day name", { exact: true }).fill("Push");
    await page.getByLabel("Day instructions").fill("Warm up first");
    await page
      .getByRole("button", { name: "Save routine day", exact: true })
      .click();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Weekly plan" }),
    ).toBeVisible();
    await page.getByLabel("Tracking date").fill("2026-10-06");
    await page.getByRole("button", { name: "Start Push", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Preview routine start" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start planned workout", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Weekly plan · Push" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Open Barbell bench press",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByText("More actions ···", { exact: true }).click();
    await page
      .getByRole("button", { name: "Comment workout", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Workout comment", exact: true }),
    ).toHaveValue("Warm up first");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Routines", exact: true }).click();
    await page.getByRole("button", { name: "Archive routine" }).click();
    await page.getByLabel("Show archived routines").check();
    await expect(
      page.getByRole("button", { name: "Start Push", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Restore routine" }).click();
    await page
      .getByRole("button", { name: "Edit template", exact: true })
      .click();
    await page.getByLabel("Day name", { exact: true }).fill("Upper body");
    await page.getByRole("button", { name: "Save day details" }).click();
    await expect(
      page.getByRole("heading", { name: "Upper body", exact: true }),
    ).toBeVisible();
    for (const theme of ["dark", "light"]) {
      await page.getByLabel("Color theme").selectOption(theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/workouts/routines-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Upper body", exact: true }),
    ).toBeVisible();
  });

test("mobile exercise editor leads with stepped inputs and Save/Clear", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("longevity-theme", "light"),
  );
  await fixture(page);
  await page.goto("/workouts?date=" + date);
  await page.getByRole("button", { name: "Start new workout" }).click();
  await page.getByRole("button", { name: "Add Barbell bench press" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Barbell bench press",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  const saveSet = page.getByRole("button", {
    name: "Save completed set",
    exact: true,
  });
  await expect(saveSet).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Increase Weight (kg)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Graph", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Exercise in this workout", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByLabel("Exercise options", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose exercise", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exercise stats", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rest timer", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Rest timer", exact: true }),
  ).toBeVisible();
  const rest = page.getByRole("dialog", { name: "Rest timer", exact: true });
  await rest.getByLabel("Rest seconds", { exact: true }).fill("1");
  await rest.getByLabel("Volume", { exact: true }).fill("30");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await rest.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `/tmp/rest-timer-${width}.png` });
  }
  await rest.getByRole("button", { name: "Start rest", exact: true }).click();
  await expect(rest.getByRole("status")).toHaveText("Rest finished.");
  await rest.getByRole("button", { name: "Stop rest", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Exercise notes", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Exercise notes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose exercise", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Exercises in this workout",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close navigation panel", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("training-mobile-light.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("training-desktop-light.png"),
    fullPage: true,
  });
});

for (const width of [390, 1440]) {
  test(`selects, drags and deletes workout exercises at ${width}px`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 950 });
    const items = ["Bench", "Row", "Press"].map((name, index) => ({
      id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
      exercise_id: exerciseId,
      exercise_name: name,
      category_name: "Chest",
      tracking_type: "strength",
      weight_unit: "kg",
      distance_unit: "km",
      display_order: index * 10,
      sets: [],
    }));
    const saved = {
      id: sessionId,
      name: "Workout",
      performed_on: date,
      notes: "",
      is_finished: false,
      created_at: "",
      completed_set_count: 0,
      exercises: items,
    };
    const writes: Record<string, unknown>[] = [];
    await page.route(/\/api\/v1\/workouts\/sessions\//, async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        const data = req.postDataJSON();
        writes.push(data);
        saved.exercises =
          data.action === "delete"
            ? saved.exercises.filter(
                (item) => !data.exercise_ids.includes(item.id),
              )
            : data.exercise_ids.map(
                (id: string) => saved.exercises.find((item) => item.id === id)!,
              );
        await route.fulfill({ json: saved });
      } else
        await route.fulfill({
          json: new URL(req.url()).pathname.endsWith(`/${sessionId}/`)
            ? saved
            : { count: 1, next: null, previous: null, results: [saved] },
        });
    });
    await page.goto("/workouts?date=" + date);
    await page.getByLabel("Color theme").selectOption("light");
    const bench = page.getByRole("button", { name: "Open Bench", exact: true });
    const bounds = (await bench.boundingBox())!;
    await page.mouse.move(bounds.x + 30, bounds.y + 25);
    await page.mouse.down();
    await expect(
      page.getByRole("toolbar", { name: "Selected exercises" }),
    ).toContainText("1 exercise selected");
    await page.mouse.up();
    expect(writes).toHaveLength(0);
    const handle = (await page
      .getByRole("button", { name: "Reorder Bench" })
      .boundingBox())!;
    const row = (await page
      .getByRole("button", { name: "Select Row", exact: true })
      .boundingBox())!;
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    const benchBefore = (await page
      .getByRole("button", { name: "Select Bench", exact: true })
      .boundingBox())!;
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2, {
      steps: 5,
    });
    await expect
      .poll(
        async () =>
          (await page
            .getByRole("button", { name: "Select Bench", exact: true })
            .boundingBox())!.y,
      )
      .toBeGreaterThan(benchBefore.y + 20);
    await expect
      .poll(
        async () =>
          (await page
            .getByRole("button", { name: "Select Row", exact: true })
            .boundingBox())!.y,
      )
      .toBeLessThan(row.y - 20);
    expect(writes).toHaveLength(0);
    await page.screenshot({
      path: `test-results/workouts/dragging-${width}.png`,
      fullPage: true,
    });
    await page.mouse.up();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual({
      action: "reorder",
      exercise_ids: [items[1].id, items[0].id, items[2].id],
      expected_order: items.map((item) => item.id),
    });
    await expect(
      page.getByRole("button", { name: "Select Row", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Select Row", exact: true }).click();
    await expect(
      page.getByRole("toolbar", { name: "Selected exercises" }),
    ).toContainText("2 exercises selected");
    await page.screenshot({
      path: `test-results/workouts/selection-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Delete selected", exact: true })
      .click();
    expect(writes).toHaveLength(1);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Delete selected", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm exercise deletion", exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toEqual({
      action: "delete",
      exercise_ids: [items[1].id, items[0].id],
    });
    await expect(
      page.getByRole("button", { name: "Open Press", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Bench", exact: true }),
    ).toHaveCount(0);
  });
}

test("moves the open workout to another date without creating a copy", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/workouts?date=" + date);
  await page
    .getByRole("button", { name: "Start new workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Barbell bench press", exact: true })
    .click();
  await page.getByLabel("Exercise options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Workout overview", exact: true })
    .click();
  await page.getByText("More actions ···", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy workout", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Move workout", exact: true }).click();
  await page.getByLabel("Move to date").fill("2026-10-03");
  const request = page.waitForRequest(
    (req) =>
      req.method() === "PATCH" &&
      new URL(req.url()).pathname.endsWith(`/${sessionId}/`),
  );
  await page.getByRole("button", { name: "Move", exact: true }).click();
  expect((await request).postDataJSON()).toEqual({
    performed_on: "2026-10-03",
  });
  await expect(page.getByLabel("Tracking date")).toHaveValue("2026-10-03");
  await expect(
    page.getByRole("button", { name: "Open Barbell bench press", exact: true }),
  ).toBeVisible();
});

test("navigation panel links a coloured group and keeps exercise navigation accessible", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 950 });
  const items = ["Bench", "Row"].map((name, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
    exercise_id: exerciseId,
    exercise_name: name,
    category_name: "Chest",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    display_order: index * 10,
    sets: [],
    group_name: "",
    group_colour: null as string | null,
  }));
  const saved = {
    id: sessionId,
    name: "Workout",
    performed_on: date,
    notes: "",
    is_finished: false,
    created_at: "",
    completed_set_count: 0,
    exercises: items,
  };
  await page.route(/\/api\/v1\/workouts\/sessions\//, async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON();
      for (const item of items)
        if (body.member_ids.includes(item.id)) {
          item.group_name = body.name;
          item.group_colour = body.colour;
        }
      await route.fulfill({ json: saved });
    } else
      await route.fulfill({
        json: new URL(req.url()).pathname.endsWith(`/${sessionId}/`)
          ? saved
          : { count: 1, next: null, previous: null, results: [saved] },
      });
  });
  await page.goto("/workouts?date=" + date);
  await page.getByLabel("Color theme").selectOption("light");
  await page.getByRole("button", { name: "Open Bench", exact: true }).click();
  const reorderWrites: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/exercises/bulk/"))
      reorderWrites.push(request.method());
  });
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 3, y: 400 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 100, y: 402 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const panel = page.getByRole("dialog", {
    name: "Exercises in this workout",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => Math.round((await panel.boundingBox())!.x))
    .toBe(0);
  const row = panel.getByRole("button", {
    name: "Switch to Bench",
    exact: true,
  });
  const box = (await row.boundingBox())!;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + 60, y: box.y + 25 }],
  });
  await expect(panel.locator(".is-dragging")).toBeVisible();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: box.x + 60, y: box.y + 125 }],
  });
  await expect(panel.locator(".is-dragging")).toBeVisible();
  await expect
    .poll(async () => (await row.boundingBox())!.y)
    .toBeGreaterThan(box.y + 50);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(panel.locator(".is-dragging")).toHaveCount(0);
  expect(reorderWrites).toEqual([]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `/tmp/workout-navigation-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await panel
    .getByRole("button", { name: "Add to group", exact: true })
    .click();
  await page.getByRole("button", { name: "New group", exact: true }).click();
  await expect(page.getByLabel("Group name")).toHaveValue("Superset 1");
  const editor = page.getByRole("dialog", { name: "New group", exact: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await editor.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `/tmp/workout-group-${width}.png` });
  }
  await expect(
    page.getByRole("checkbox", { name: "Bench", exact: true }),
  ).toBeChecked();
  await page.getByRole("checkbox", { name: "Row", exact: true }).check();
  await page.getByRole("button", { name: "Red", exact: true }).click();
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Edit group", exact: true }),
  ).toBeEnabled();
  const mark = panel.locator('[data-exercise-id="' + items[0].id + '"]');
  await expect(mark).toHaveCSS("border-inline-start-color", "rgb(220, 38, 38)");
  await panel
    .getByRole("button", { name: "Switch to Row", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Row", level: 1, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose exercise", exact: true })
    .click();
  await panel.getByRole("button", { name: "Edit group", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Superset 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await panel.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Bench", exact: true }),
  ).toBeVisible();
});

test("focused calculators plan sets and preserve coloured equipment and exercise bars", async ({
  page,
}) => {
  const preferences: WorkoutPreferences = {};
  await fixture(page, preferences);
  await page.setViewportSize({ width: 390, height: 950 });
  await page.route("**/records/?*", (route) =>
    route.fulfill({
      json: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            date,
            value: "100",
            reps: 5,
            tracking_type: "strength",
            weight_unit: "kg",
            distance_unit: "km",
            source: {
              workout_id: sessionId,
              item_id: itemId,
              set_id: "record",
              weight: "100",
              reps: 5,
            },
          },
        ],
      },
    }),
  );
  await page.goto("/workouts?date=" + date);
  await page.getByLabel("Color theme").selectOption("light");
  await page
    .getByRole("button", { name: "Start new workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Barbell bench press", exact: true })
    .click();
  const open = async (name: string) => {
    await page.getByLabel("Exercise options", { exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
  };
  await open("1RM Calculator");
  let dialog = page.getByRole("dialog", {
    name: "One-rep-max calculator",
    exact: true,
  });
  await dialog.getByLabel("Weight (kg)", { exact: true }).fill("110");
  await dialog.getByLabel("Reps", { exact: true }).fill("5");
  await expect(dialog.getByText("128.3 kg", { exact: true })).toBeVisible();
  await expect(dialog.locator(".workout-rm-list > div")).toHaveCount(15);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `/tmp/calculator-max-${width}.png` });
  }
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await open("Set Calculator");
  dialog = page.getByRole("dialog", { name: "Set calculator", exact: true });
  await dialog.getByRole("button", { name: "Select max", exact: true }).click();
  await dialog
    .getByRole("button", { name: "5RM · 100 kg", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Select percentage", exact: true })
    .click();
  await dialog.getByRole("button", { name: "75%", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("75 kg");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `/tmp/calculator-set-${width}.png` });
  }
  const planned = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().includes(`/${itemId}/sets/`),
  );
  await dialog
    .getByRole("button", { name: "Add to workout", exact: true })
    .click();
  expect((await planned).postDataJSON()).toEqual({
    weight: "75.000",
    reps: null,
    is_completed: false,
  });
  await expect(dialog).toHaveCount(0);
  await open("Plate Calculator");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Plate settings", exact: true });
  await page.setViewportSize({ width: 320, height: 950 });
  expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    false,
  );
  await page.screenshot({ path: "/tmp/calculator-equipment-320.png" });
  await dialog.getByRole("button", { name: "Edit bar", exact: true }).click();
  await page.getByLabel("Default bar weight (kg)", { exact: true }).fill("15");
  await page.getByLabel("Exercise", { exact: true }).selectOption(exerciseId);
  await page
    .getByRole("button", { name: "Add exercise bar", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Edit 20 kg plate", exact: true })
    .click();
  await page.getByLabel("Total plate count", { exact: true }).fill("4");
  await page.getByLabel("Plate colour", { exact: true }).fill("#2563eb");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await dialog.getByLabel("Available 20 kg plate", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Save equipment defaults", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Plate calculator", exact: true });
  await dialog
    .getByLabel("Target including bar (kg)", { exact: true })
    .fill("95");
  await expect(dialog.getByRole("img")).toHaveAccessibleName(
    "Plates on each side: 2 × 20 kg",
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `/tmp/calculator-plates-${width}.png` });
  }
  expect(preferences.exercise_bars).toEqual([
    { exercise_id: exerciseId, weight_unit: "kg", weight: "15.000" },
  ]);
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Barbell bench press", exact: true })
    .click();
  await open("Plate Calculator");
  dialog = page.getByRole("dialog", { name: "Plate calculator", exact: true });
  await dialog
    .getByLabel("Target including bar (kg)", { exact: true })
    .fill("95");
  await expect(
    dialog.getByText("15 kg bar + 40 kg each side", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".workout-loaded-plate").first()).toHaveCSS(
    "background-color",
    "rgb(37, 99, 235)",
  );
});

test("training history shows date and set stats, edits history and copies into the current exercise", async ({
  page,
}) => {
  await fixture(page, { auto_start_rest: true });
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/workouts?date=" + date);
  await page.getByLabel("Color theme").selectOption("light");
  await page
    .getByRole("button", { name: "Start new workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Barbell bench press", exact: true })
    .click();
  const sets = [70, 80].map((weight, index) => ({
    id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, "0")}`,
    display_order: index * 10,
    weight: String(weight),
    reps: 5,
    distance: null,
    duration_seconds: null,
    comment: index === 0 ? "Good form" : "",
    is_completed: true,
  }));
  const sourceId = "88888888-8888-4888-8888-888888888888",
    sourceItem = "99999999-9999-4999-8999-999999999999";
  const occurrence = {
    id: sourceItem,
    exercise_id: exerciseId,
    exercise_name: "Barbell bench press",
    category_name: "Chest",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    display_order: 10,
    sets,
  };
  const old = {
    id: sourceId,
    name: "Bench day",
    performed_on: "2020-01-01",
    notes: "",
    is_finished: false,
    completed_set_count: 2,
    created_at: "",
    exercises: [occurrence],
  };
  let copied: typeof sets = [];
  await page.route(/\/sessions\/\?/, (route) =>
    new URL(route.request().url()).searchParams.get("all_history") === "true"
      ? route.fulfill({
          json: { count: 1, next: null, previous: null, results: [old] },
        })
      : route.fallback(),
  );
  await page.route(`**/sessions/${sessionId}/`, (route) =>
    route.fulfill({
      json: {
        ...old,
        id: sessionId,
        name: "Current workout",
        performed_on: date,
        completed_set_count: 0,
        exercises: [{ ...occurrence, id: itemId, sets: copied }],
      },
    }),
  );
  await page.route("**/records/?*", (route) =>
    route.fulfill({
      json: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            date: old.performed_on,
            value: "80",
            reps: 5,
            tracking_type: "strength",
            weight_unit: "kg",
            distance_unit: "km",
            source: {
              workout_id: sourceId,
              item_id: sourceItem,
              set_id: sets[1].id,
              weight: "80",
              reps: 5,
            },
          },
        ],
      },
    }),
  );
  await page.route(`**/session-exercises/${itemId}/copy-sets/`, (route) => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      source_workout_id: sourceId,
      set_ids: [sets[1].id],
    });
    copied = [
      {
        ...sets[1],
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        is_completed: false,
        comment: "",
      },
    ];
    return route.fulfill({ status: 201, json: copied });
  });
  await page.route(`**/sets/${sets[0].id}/`, (route) => {
    const body = route.request().postDataJSON();
    expect(body.is_completed).toBeUndefined();
    Object.assign(sets[0], body);
    return route.fulfill({ json: sets[0] });
  });
  await page
    .getByRole("button", { name: "Exercise history", exact: true })
    .click();
  await expect(page.getByText("Good form", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Current personal record", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: `/tmp/training-history-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.getByRole("button", { name: /Workout on .*1 Jan 2020/ }).click();
  let dialog = page.getByRole("dialog", { name: /1 Jan 2020/ });
  await expect(dialog.getByText("750 kg·reps", { exact: true })).toBeVisible();
  await expect(dialog.getByText("10 reps", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/training-history-date-stats.png" });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /Set 2 on .*80 kg/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("93.3 kg", { exact: true })).toBeVisible();
  await expect(dialog.getByText("400 kg·reps", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/training-history-set-stats.png" });
  await dialog.getByRole("button", { name: "Copy set", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Copy set", exact: true });
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Set 1 on .*70 kg/ }).click();
  await page.getByRole("button", { name: "Edit set", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit set", exact: true });
  await dialog.getByLabel("Weight (kg)", { exact: true }).fill("75");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Set 1 on .*1 Jan 2020.*75 kg/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Track", exact: true })
    .click();
  await page.getByRole("button", { name: "Rest timer", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Rest timer", exact: true });
  await expect(
    dialog.getByRole("button", { name: "Start rest", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Stop rest", exact: true }),
  ).toHaveCount(0);
});

test("exercise analytics connects graphs, records, statistic periods, goals and workout previews", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/workouts?date=" + date);
  await page.getByLabel("Color theme").selectOption("light");
  await page
    .getByRole("button", { name: "Start new workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Barbell bench press", exact: true })
    .click();
  const days = ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", date];
  const workouts = days.map((day, index) => ({
    id:
      index === 4
        ? sessionId
        : `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
    name: "Bench workout",
    performed_on: day,
    notes: "",
    is_finished: false,
    completed_set_count: 1,
    created_at: "",
    exercises: [
      {
        id:
          index === 4
            ? itemId
            : `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, "0")}`,
        exercise_id: exerciseId,
        exercise_name: "Barbell bench press",
        category_name: "Chest",
        tracking_type: "strength",
        weight_unit: "kg",
        distance_unit: "km",
        display_order: 10,
        sets: [
          {
            id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, "0")}`,
            display_order: 10,
            weight: String(70 + index * 5),
            reps: 5,
            distance: null,
            duration_seconds: null,
            comment: "",
            is_completed: true,
          },
        ],
      },
    ],
  }));
  const point = (
    workout: (typeof workouts)[number],
    metric = "max_weight",
  ) => ({
    date: workout.performed_on,
    value:
      metric === "estimated_1rm"
        ? String((Number(workout.exercises[0].sets[0].weight) * 7) / 6)
        : metric === "max_reps"
          ? "5"
          : metric.includes("volume")
            ? String(Number(workout.exercises[0].sets[0].weight) * 5)
            : workout.exercises[0].sets[0].weight,
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    source: {
      workout_id: workout.id,
      item_id: workout.exercises[0].id,
      set_id: workout.exercises[0].sets[0].id,
      weight: workout.exercises[0].sets[0].weight,
      reps: 5,
    },
  });
  const records = [
    {
      ...point(workouts[0]),
      value: "60",
      reps: 4,
      source: { ...point(workouts[0]).source, weight: "60", reps: 4 },
    },
    { ...point(workouts[4]), reps: 5 },
  ];
  await page.route(/\/sessions\/\?/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const selected = workouts.filter(
      (workout) =>
        workout.performed_on <= params.get("date_to")! &&
        (params.get("all_history") === "true" ||
          workout.performed_on >= params.get("date_from")!),
    );
    return route.fulfill({
      json: {
        count: selected.length,
        next: null,
        previous: null,
        results: selected,
      },
    });
  });
  await page.route(/\/sessions\/[a-f0-9-]+\/$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    return route.fulfill({
      json: workouts.find((workout) => workout.id === id),
    });
  });
  await page.route("**/progress/?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        count: workouts.length,
        next: null,
        previous: null,
        types: ["strength"],
        results: workouts
          .filter((workout) => workout.performed_on <= params.get("date_to")!)
          .map((workout) => point(workout, params.get("metric")!)),
      },
    });
  });
  await page.route("**/records/?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const rows = params.get("history")
      ? workouts
          .filter((workout) => workout.performed_on <= params.get("date_to")!)
          .map((workout) => ({ ...point(workout), reps: 5 }))
          .reverse()
      : records;
    return route.fulfill({
      json: { count: rows.length, next: null, previous: null, results: rows },
    });
  });
  await page.route("**/stats/?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const selected = workouts.filter(
      (workout) =>
        workout.performed_on <= params.get("date_to")! &&
        (!params.get("date_from") ||
          workout.performed_on >= params.get("date_from")!) &&
        (!params.get("workout_id") || workout.id === params.get("workout_id")),
    );
    const best = selected.at(-1)!;
    return route.fulfill({
      json: {
        exercise_id: exerciseId,
        date_to: params.get("date_to"),
        groups: selected.length
          ? [
              {
                tracking_type: "strength",
                weight_unit: "kg",
                distance_unit: "km",
                session_count: selected.length,
                set_count: selected.length,
                reps_total: selected.length * 5,
                volume_total: String(
                  selected.reduce(
                    (sum, w) => sum + Number(w.exercises[0].sets[0].weight) * 5,
                    0,
                  ),
                ),
                distance_total: null,
                duration_seconds_total: null,
                first_date: selected[0].performed_on,
                last_date: best.performed_on,
                bests: {
                  max_weight: point(best),
                  max_reps: point(best, "max_reps"),
                  workout_volume: point(best, "workout_volume"),
                  estimated_1rm: point(best, "estimated_1rm"),
                },
              },
            ]
          : [],
      },
    });
  });
  const goals: Record<string, unknown>[] = [];
  await page.route("**/goals/**", (route) => {
    if (route.request().method() === "POST") {
      const goal = {
        ...route.request().postDataJSON(),
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        tracking_type: "strength",
        weight_unit: "kg",
        distance_unit: "km",
        target_weight: null,
        target_reps: null,
        rep_rule: "at_least",
        created_at: "",
        achieved: false,
        best_weight: null,
        best_value: "90",
        progress_percent: "64.3",
        source: point(workouts[4]).source,
        source_date: date,
      };
      goals.push(goal);
      return route.fulfill({ status: 201, json: goal });
    }
    return route.fulfill({ json: goals });
  });
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  const chart = page.getByRole("img", {
    name: /Estimated 1RM by training date/,
  });
  await expect(chart).toBeVisible();
  await expect(chart.locator('[data-testid="graph-hit-target"]')).toHaveCount(
    5,
  );
  await page
    .getByRole("button", { name: "Next graph point", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Next graph point", exact: true })
    .click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: `/tmp/exercise-graph-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByLabel("Graph options", { exact: true }).click();
  await page.getByLabel("Graph points", { exact: true }).uncheck();
  await page.getByLabel("Trend line", { exact: true }).check();
  await page.getByLabel("Y-axis from 0", { exact: true }).check();
  await expect(chart.locator('[data-testid="graph-trend-line"]')).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share graph", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("workout-progress.png");
  const png = await readFile((await download.path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await page.getByLabel("Graph options", { exact: true }).click();
  await page.locator(".workout-graph-point-navigation button").nth(1).click();
  let dialog = page.getByRole("dialog");
  await page.screenshot({ path: "/tmp/exercise-workout-preview-390.png" });
  await dialog.getByRole("button", { name: /Barbell bench press/ }).click();
  await page.screenshot({ path: "/tmp/exercise-preview-summary-390.png" });
  await dialog
    .getByRole("button", { name: "View exercise overview", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Exercise overview sections" }),
  ).toBeVisible();
  await page.goto("/workouts?date=" + date);
  await page
    .getByRole("button", { name: "Open Barbell bench press", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Exercise stats", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Actual", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "4RM inferred: 90 kg", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "5RM record: 90 kg", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "PR history · 5 reps · kg",
    exact: true,
  });
  await expect(
    dialog.getByRole("heading", { name: "Current record", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.getByLabel("Graph", { exact: true })).toHaveValue(
    "rep_maxes",
  );
  await page.getByRole("button", { name: "Records", exact: true }).click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `/tmp/exercise-records-actual-${width}.png`,
    });
  }
  await page.getByRole("button", { name: "Estimated", exact: true }).click();
  await expect(page.getByText("15RM", { exact: true })).toBeVisible();
  await page.getByText("Estimate settings", { exact: true }).click();
  await page
    .getByLabel("Estimated 1RM rep limit", { exact: true })
    .selectOption("12");
  await expect(page.getByText("15RM", { exact: true })).toBeVisible();
  await page.getByText("Estimate settings", { exact: true }).click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: `/tmp/exercise-records-${width}.png` });
  }
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await page.getByLabel("Period", { exact: true }).selectOption("month");
  await expect(
    page.getByText("450 kg·reps", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /Max weight: 90 kg/ }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: /Barbell bench press/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: `/tmp/exercise-statistics-${width}.png` });
  }
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  await page.getByRole("button", { name: "New goal", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Goal type", { exact: true })
    .selectOption("max_weight");
  await dialog
    .getByLabel("Target Max weight (kg)", { exact: true })
    .fill("140");
  await dialog.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: /Max weight/ }),
  ).toHaveAttribute("value", "64.3");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: `/tmp/exercise-goals-${width}.png` });
  }
  await page
    .getByRole("button", {
      name: "Open goal: Max weight · 140 kg",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
