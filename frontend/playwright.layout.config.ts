import { defineConfig } from "@playwright/test";

// Layout fixtures intercept every API request; no backend or database is needed.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "layout.spec.ts",
  outputDir: "./test-results/layout",
  forbidOnly: !!process.env.CI,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5187",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5187 --strictPort",
    url: "http://127.0.0.1:5187",
    reuseExistingServer: false,
  },
});
