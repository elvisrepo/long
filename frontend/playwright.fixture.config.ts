import { defineConfig, devices } from "@playwright/test";

// API-intercepted UI checks: no Django server or database container is required.
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["layout.spec.ts", "workouts.spec.ts"],
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5175", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5175 --strictPort",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
