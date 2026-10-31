import { fileURLToPath } from "node:url"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        // Client data modules (src/client/data) are unit-tested too, through their aliases.
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src/client", import.meta.url)),
            "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
          },
        },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.int.test.ts"],
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
        // The browser API listens on Vitest's port 63315 with the dev server's strictPort, so a
        // second run (another worktree) would refuse to start. Let it take the next free port.
        server: { strictPort: false },
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
