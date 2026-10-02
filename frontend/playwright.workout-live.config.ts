import { defineConfig, devices } from "@playwright/test";

// Separate Vite port prevents reuse of a developer's normal :8000 proxy.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "workout-live.spec.ts",
  outputDir: "../playground/workout-live-results",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5176", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "docker compose --profile e2e up --build web-e2e",
      cwd: "../backend",
      url: "http://127.0.0.1:8001/api/v1/health/live/",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "VITE_API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev -- --host 127.0.0.1 --port 5176 --strictPort",
      url: "http://127.0.0.1:5176",
      reuseExistingServer: false,
    },
  ],
});
