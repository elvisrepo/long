import { expect, test } from '@playwright/test'

test('user can register, log in, visit settings, and log out', async ({ page }) => {
  const uniqueEmail = `user-${Date.now()}@example.com`
  const password = 'Secret123!Strong'

  await page.goto('/register')

  await expect(
    page.getByRole('heading', { name: /register/i }),
  ).toBeVisible()

  await page.getByLabel(/email/i).fill(uniqueEmail)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /register/i }).click()

  await expect(
    page.getByRole('heading', { name: /login/i }),
  ).toBeVisible()

  await page.getByLabel(/email/i).fill(uniqueEmail)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /login/i }).click()

  await expect(
    page.getByRole('heading', { name: /dashboard/i }),
  ).toBeVisible()

  await page.getByRole('link', { name: /settings/i }).click()

  await expect(
    page.getByRole('heading', { name: /settings/i }),
  ).toBeVisible()

  await expect(
    page.getByText(new RegExp(uniqueEmail, 'i')),
  ).toBeVisible()

  await page.getByRole('button', { name: /logout/i }).click()

  await expect(
    page.getByRole('heading', { name: /login/i }),
  ).toBeVisible()
})
