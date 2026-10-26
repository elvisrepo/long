import { test, expect, type Page } from "@playwright/test";
const uid = (n: number) =>
  `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, "0")}`;
const categoryNames = ["Chest", "Triceps", "Back", "Legs", "Shoulders"];
const colours = ["#dc2626", "#16a34a", "#2563eb", "#0891b2", "#9333ea"];
const categories = categoryNames.map((name, n) => ({
  id: uid(n + 1),
  name,
  colour: colours[n],
  display_order: n * 10,
  is_active: true,
}));
const names = [
  "Flat Barbell Bench Press",
  "Close Grip Barbell Bench Press",
  "Barbell Row",
  "Leg Press",
  "Overhead Press",
];
const exercises = names.map((name, n) => ({
  id: uid(n + 10),
  name,
  category_id: categories[n].id,
  tracking_type: "strength",
  weight_unit: "kg",
  distance_unit: "km",
  notes: "",
  is_active: true,
  display_order: n * 10,
  weight_increment: "2.500",
  rest_seconds: 90,
}));
let serial = 100;
function workout(
  day: number,
  indices: number[],
  planned = false,
  name?: string,
) {
  return {
    id: uid(++serial),
    name: name ?? (indices[0] === 0 ? "Push" : "Pull / Legs"),
    performed_on: `2018-01-${String(day).padStart(2, "0")}`,
    notes: "",
    is_finished: !planned,
    created_at: `2018-01-${String(day).padStart(2, "0")}T10:00:00Z`,
    completed_set_count: planned
      ? 0
      : indices.reduce((sum, i) => sum + (day === 12 && i === 0 ? 5 : 3), 0),
    exercises: indices.map((i) => ({
      id: uid(++serial),
      exercise_id: exercises[i].id,
      exercise_name: names[i],
      category_name: categoryNames[i],
      tracking_type: "strength",
      weight_unit: "kg",
      distance_unit: "km",
      display_order: i * 10,
      group_name: "",
      group_colour: "#007f68",
      sets: (day === 12 && i === 0
        ? [60, 80, 100, 102.5, 105]
        : [80, 70, 60]
      ).map((weight, n) => ({
        id: uid(++serial),
        weight: planned ? null : String(weight),
        reps: i === 0 ? 5 : [8, 10, 12][n],
        distance: null,
        duration_seconds: null,
        display_order: n * 10,
        is_completed: !planned,
        comment: "",
      })),
    })),
  };
}
const days: [number, number[]][] = [
  [1, [0, 1]],
  [2, [2, 3, 4]],
  [4, [0, 1, 4]],
  [6, [2, 3]],
  [7, [0, 1]],
  [9, [2, 3]],
  [10, [2, 3]],
  [12, [0, 1]],
];
const sessions = days.map(([day, indices]) => workout(day, indices));
sessions.push(
  workout(12, [4], true, "Evening plan"),
  workout(17, [2], true, "Planned pull"),
  workout(25, [], true, "Empty draft"),
);

async function fixture(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    let json: unknown = {};
    if (path.includes("/workouts/"))
      expect(route.request().method()).toBe("GET");
    if (path.endsWith("/refresh/")) json = { access: "calendar-fixture" };
    else if (path.endsWith("/me/"))
      json = { email: "calendar-review@example.test" };
    else if (path.endsWith("/current/"))
      json = { plan: { code: "free", name: "Free" }, status: "active" };
    else if (path.endsWith("/catalog/"))
      json = { categories, exercises, preferences: {} };
    else if (path.endsWith("/sessions/")) {
      const from = url.searchParams.get("date_from") ?? "0000",
        to = url.searchParams.get("date_to") ?? "9999";
      const rows = sessions
        .filter((row) => row.performed_on >= from && row.performed_on <= to)
        .sort((a, b) => b.performed_on.localeCompare(a.performed_on));
      json = { count: rows.length, next: null, previous: null, results: rows };
    } else if (path.includes("/sessions/"))
      json = sessions.find((row) => path.includes(row.id));
    else if (path.endsWith("/routines/")) json = [];
    await route.fulfill({ json });
  });

  await page.goto("/workouts?view=calendar&date=2018-01-12");
  await expect(
    page.getByRole("button", {
      name: "2018-01-12: 1 training session, 1 planned session",
      exact: true,
    }),
  ).toBeVisible();
}

test("shared Month/List filters retain full sources and inspect dates without changing Home", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  expect(
    await page
      .locator(".workout-calendar-grid")
      .evaluate((el) => el.getBoundingClientRect().top + scrollY),
  ).toBeLessThan(500);
  await page
    .getByRole("button", { name: "Calendar filters", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Chest", exact: true }).check();
  await page
    .getByRole("combobox", { name: "Calendar exercise", exact: true })
    .selectOption(exercises[0].id);
  await page.getByLabel("Weight value", { exact: true }).fill("100");
  await page.getByLabel("Reps value", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "2018-01-01: 0 training sessions, 0 planned sessions",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".calendar-list-workout")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Preview Push on 2018-01-12", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /Close Grip Barbell Bench Press/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Month view", exact: true }).click();
  await page
    .getByRole("button", {
      name: "2018-01-10: 1 training session, 0 planned sessions",
      exact: true,
    })
    .click();
  await expect(
    page.locator('.workout-calendar-grid button[aria-pressed="true"]'),
  ).toHaveAttribute("aria-label", /2018-01-10/);
  await expect(page).toHaveURL(/date=2018-01-12/);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Next matching workout day", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Fri, 12 Jan 2018");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Go to workout", exact: true })
    .click();
  await expect(page).toHaveURL(/view=home/);
});
for (const theme of ["light", "dark"])
  test(`display choices, panel and month jump in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(
      (theme) => localStorage.setItem("longevity-theme", theme),
      theme,
    );
    await fixture(page);
    await page
      .getByRole("button", { name: "Calendar display options", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Workout panel", exact: true })
      .check();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("complementary", { name: "Selected workout details" }),
    ).toContainText("Flat Barbell Bench Press");
    await page
      .getByRole("button", {
        name: "2018-01-10: 1 training session, 0 planned sessions",
        exact: true,
      })
      .click();
    await expect(page.getByRole("complementary")).toContainText("Barbell Row");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 844 });
    await page
      .getByRole("button", {
        name: "2018-01-12: 1 training session, 1 planned session",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Choose calendar month", exact: true })
      .click();
    await page.locator('input[type="month"]').fill("2018-02");
    await page
      .getByRole("button", { name: "Go to month", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "February 2018", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/date=2018-02-01/);
  });
