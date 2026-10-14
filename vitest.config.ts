import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
          // A zone far from both UTC and the household zone catches accidental local-time math.
          env: { TZ: "Pacific/Auckland" },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts", "scripts/**/*.int.test.ts"],
          globalSetup: ["src/server/test/global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Components through the real Vite pipeline (React Compiler included) in happy-dom.
        extends: "./vite.config.ts",
        test: {
          name: "component",
          include: ["src/**/*.component.test.tsx"],
          environment: "happy-dom",
        },
      },
      {
        // Interaction tests in real browsers: Chromium and WebKit (iOS Safari's engine).
        extends: "./vite.config.ts",
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "webkit" }],
          },
        },
      },
    ],
  },
})
