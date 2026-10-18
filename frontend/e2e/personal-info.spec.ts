import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "./support/e2e-api";

test("personal info produces a separate BMR estimate from the latest weight", async ({
  page,
  request,
}) => {
  await resetE2eDatabase(request);
  const email = "personal-info-e2e@example.com";
  const password = "Secret123!Strong";
  expect(
    (
      await request.post("/api/auth/register/", { data: { email, password } })
    ).status(),
  ).toBe(201);
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Body Weight entry" }).click();
  await page.getByLabel("Body Weight value").fill("80");
  await page.getByRole("button", { name: "Save weight entry" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await navigation.getByRole("link", { name: "Settings", exact: true }).click();
  const birthDate = `${new Date().getUTCFullYear() - 30}-01-01`;
  await page.getByLabel("Date of birth").fill(birthDate);
  await page.getByLabel("Sex for calculation").selectOption("male");
  await page.getByLabel("Height (cm)").fill("180");
  await page.getByRole("button", { name: "Save personal info" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Personal info saved" }),
  ).toBeVisible();
  const profile = page.getByRole("region", {
    name: "Personal info",
    exact: true,
  });
  await expect(profile.getByText("1,780", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Date of birth")).toHaveValue(birthDate);
  await expect(profile.getByText("1,780", { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("bmr-settings-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("bmr-settings-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await navigation
    .getByRole("link", { name: "Dashboard", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "Estimated BMR",
    exact: true,
  });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("1,780", { exact: true })).toBeVisible();
  await expect(card.getByText(/Mifflin–St Jeor/)).toBeVisible();
  await expect(card.getByRole("button", { name: /add/i })).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("bmr-dashboard-mobile.png"),
    fullPage: true,
  });
  await card.getByRole("link", { name: /Estimated BMR/ }).click();
  await page.getByRole("button", { name: "Clear personal info" }).click();
  await expect(profile.getByText("1,780", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Height (cm)")).toHaveValue("");
});
