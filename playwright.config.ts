import { defineConfig, devices } from "@playwright/test"

// End-to-end tests run the production build (`pnpm build` first) on the real server, against a
// throwaway database that `scripts/e2e-setup.ts` recreates and seeds on every run.
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

// Every user-facing project depends on the one sign-in; service workers are blocked there so a
// test never runs against a cached shell. The PWA project runs last, alone, in Chromium.
const browsers = [
  { name: "chromium-desktop", device: devices["Desktop Chrome"] },
  { name: "chromium-phone", device: devices["Pixel 7"] },
  { name: "webkit-desktop", device: devices["Desktop Safari"] },
  { name: "webkit-phone", device: devices["iPhone 15"] },
]

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/e2e-setup.ts && node src/server/index.ts",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/kabigting_e2e",
      BETTER_AUTH_SECRET: "e2e-only-secret-that-guards-nothing-real-0123456789",
      BASE_URL,
      PORT: String(PORT),
      NODE_ENV: "production",
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    ...browsers.map(({ name, device }) => ({
      name,
      dependencies: ["setup"],
      testIgnore: /pwa\.spec\.ts/,
      use: { ...device, serviceWorkers: "block" as const },
    })),
    {
      name: "pwa-chromium",
      testMatch: /pwa\.spec\.ts/,
      dependencies: browsers.map(({ name }) => name),
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
