import { expect, test } from '@playwright/test'
import { resetE2eDatabase } from './support/e2e-api'

test.beforeEach(async ({ request }) => {
  await resetE2eDatabase(request)
})

test('user can register, log in, visit settings, and log out', async ({ page }) => {
  const uniqueEmail = 'e2e-user@example.com'
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

  await expect(
    page.getByRole('heading', { name: /resting heart rate/i }),
  ).toBeVisible()

  await page.getByLabel(/resting heart rate value/i).fill('58')
  await page.getByRole('button', { name: /log resting heart rate/i }).click()

  await expect(page.getByLabel(/resting heart rate value/i)).toHaveValue('')
  await expect(page.getByText(/58 bpm/i)).toBeVisible()

  await page
    .getByLabel(/filter recent entries by metric/i)
    .selectOption('resting_hr')
  await expect(page.getByText(/58 bpm/i)).toBeVisible()

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

test('user can create a custom metric and log it from the dashboard', async ({ page }) => {
  const uniqueEmail = 'custom-metric-e2e-user@example.com'
  const password = 'Secret123!Strong'

  await page.goto('/register')

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

  await page.getByRole('link', { name: /metrics/i }).click()

  await expect(
    page.getByRole('heading', { name: /metrics/i }),
  ).toBeVisible()

  const customMetricForm = page
    .getByRole('heading', { name: /create custom metric/i })
    .locator('..')

  await customMetricForm.getByLabel(/name/i).fill('Mood')
  await customMetricForm.getByLabel(/slug/i).fill('mood')
  await customMetricForm.getByLabel(/unit/i).fill('score')
  await customMetricForm.getByLabel(/min value/i).fill('1')
  await customMetricForm.getByLabel(/max value/i).fill('10')
  await page.getByRole('button', { name: /create custom metric/i }).click()

  await expect(customMetricForm.getByLabel(/name/i)).toHaveValue('')
  await expect(
    page.getByRole('heading', { name: /mood/i }),
  ).toBeVisible()

  await page.getByRole('link', { name: /dashboard/i }).click()

  await expect(
    page.getByRole('heading', { name: /dashboard/i }),
  ).toBeVisible()
  await expect(page.getByLabel(/mood value/i)).toBeVisible()

  await page.getByLabel(/mood value/i).fill('7')
  await page.getByRole('button', { name: /log mood/i }).click()

  await expect(page.getByLabel(/mood value/i)).toHaveValue('')
  await expect(page.getByText(/7 score/i)).toBeVisible()
})

test('user can archive and reactivate a custom metric', async ({ page }) => {
  const uniqueEmail = 'archive-metric-e2e-user@example.com'
  const password = 'Secret123!Strong'

  await page.goto('/register')

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

  await page.getByRole('link', { name: /metrics/i }).click()

  await expect(
    page.getByRole('heading', { name: /metrics/i }),
  ).toBeVisible()

  const customMetricForm = page
    .getByRole('heading', { name: /create custom metric/i })
    .locator('..')

  await customMetricForm.getByLabel(/name/i).fill('Mood')
  await customMetricForm.getByLabel(/slug/i).fill('mood')
  await customMetricForm.getByLabel(/unit/i).fill('score')
  await customMetricForm.getByLabel(/min value/i).fill('1')
  await customMetricForm.getByLabel(/max value/i).fill('10')
  await page.getByRole('button', { name: /create custom metric/i }).click()

  const activeMetrics = page.getByLabel(/available metrics/i)

  await expect(
    activeMetrics.getByRole('heading', { name: /mood/i }),
  ).toBeVisible()

  await page.getByRole('button', { name: /deactivate mood/i }).click()

  await expect(
    activeMetrics.getByRole('heading', { name: /mood/i }),
  ).not.toBeVisible()

  await page
    .getByRole('button', { name: /show deactivated custom metrics/i })
    .click()

  const archivedMetrics = page.getByRole('region', {
    name: /archived custom metrics/i,
  })

  await expect(
    archivedMetrics.getByRole('heading', { name: /mood/i }),
  ).toBeVisible()
  await expect(
    archivedMetrics.locator('.archived-status-pill').filter({
      hasText: /^Archived$/,
    }),
  ).toBeVisible()

  await archivedMetrics
    .getByRole('button', { name: /reactivate mood/i })
    .click()

  await expect(
    archivedMetrics.getByRole('heading', { name: /mood/i }),
  ).not.toBeVisible()
  await expect(
    activeMetrics.getByRole('heading', { name: /mood/i }),
  ).toBeVisible()

  await page.getByRole('link', { name: /dashboard/i }).click()

  await expect(
    page.getByRole('heading', { name: /dashboard/i }),
  ).toBeVisible()
  await expect(page.getByLabel(/mood value/i)).toBeVisible()
})

test('failed login stays on login page and shows an error', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel(/email/i).fill('missing-user@example.com')
  await page.getByLabel(/password/i).fill('wrong-password')
  await page.getByRole('button', { name: /login/i }).click()

  await expect(
    page.getByRole('heading', { name: /login/i }),
  ).toBeVisible()

  await expect(
    page.getByText(/invalid credentials/i),
  ).toBeVisible()
})

test('duplicate registration stays on register page and shows an error', async ({ page }) => {
  const email = 'duplicate-e2e-user@example.com'
  const password = 'Secret123!Strong'

  await page.goto('/register')

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /register/i }).click()

  await expect(
    page.getByRole('heading', { name: /login/i }),
  ).toBeVisible()

  await page.goto('/register')

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /register/i }).click()

  await expect(
    page.getByRole('heading', { name: /register/i }),
  ).toBeVisible()

  await expect(
    page.getByText(/a user with that email already exists/i),
  ).toBeVisible()
})

test('user can open a metric detail page from the dashboard', async ({
  page,
}) => {
  await page.goto('/register')

  const email = `metric-detail-${Date.now()}@example.com`
  const password = 'correct-horse-battery-staple'

  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /register/i }).click()

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /login/i }).click()

  await expect(
    page.getByRole('heading', { name: /dashboard/i }),
  ).toBeVisible()

  await page.getByLabel(/resting heart rate value/i).fill('58')
  await page.getByRole('button', { name: /log resting heart rate/i }).click()

  await expect(page.getByText(/58 bpm/i)).toBeVisible()

  await page
    .getByRole('link', { name: /resting heart rate/i })
    .first()
    .click()

  await expect(page).toHaveURL(/\/metrics\/resting_hr$/)
  await expect(
    page.getByRole('heading', { name: /resting heart rate/i }),
  ).toBeVisible()
  await expect(page.getByText(/resting_hr · bpm/i)).toBeVisible()
  await expect(page.getByText('Latest value', { exact: true })).toBeVisible()
  await expect(page.getByLabel(/58 bpm/i)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: /entry history/i }),
  ).toBeVisible()

  await page
    .getByRole('button', { name: /edit resting heart rate entry/i })
    .click()
  await page.getByLabel(/resting heart rate value/i).fill('62')
  await page.getByLabel(/resting heart rate notes/i).fill('after walk')
  await page
    .getByRole('button', { name: /save resting heart rate entry/i })
    .click()

  await expect(page.getByLabel(/62 bpm/i)).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: /metric entry history/i })
      .getByText(/62 bpm/i),
  ).toBeVisible()

  await page
    .getByRole('button', { name: /delete resting heart rate entry/i })
    .click()

  await expect(page.getByText(/no entries recorded yet/i)).toBeVisible()
})
