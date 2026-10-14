import { fileURLToPath } from "node:url"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { THEME_COLORS } from "./src/client/theme/colors.ts"
import { THEME_STORAGE_KEY } from "./src/client/theme/storage-key.ts"

/**
 * Sets the `light`/`dark` class before first paint, from the same storage key the theme provider
 * uses, so a dark-mode user never sees a white flash.
 */
function themeScript(): Plugin {
  const key = JSON.stringify(THEME_STORAGE_KEY)
  const script = `(function(){try{var t=localStorage.getItem(${key})||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.add(d?"dark":"light");r.style.colorScheme=d?"dark":"light"}catch(e){}})()`
  return {
    name: "kabigting:theme-script",
    transformIndexHtml: () => [{ tag: "script", children: script, injectTo: "head-prepend" }],
  }
}

/**
 * Identifies a build. The client compiles it in; the server reads `version.json` and sends it as
 * `X-App-Version`, so a client running an older build knows to look for an update.
 */
const BUILD_ID = [
  (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local").slice(0, 12),
  Date.now().toString(36),
].join("-")

function versionFile(): Plugin {
  return {
    name: "kabigting:version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: BUILD_ID }),
      })
    },
  }
}

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig(({ command }) => ({
  // `.env` belongs to the server (it sets NODE_ENV=development, which would make Vite build
  // React in development mode). The client reads no env files.
  envDir: false,
  define: { APP_BUILD_ID: JSON.stringify(command === "build" ? BUILD_ID : "dev") },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/client/routes",
      generatedRouteTree: "./src/client/routeTree.gen.ts",
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        id: "/",
        name: "Kabigting Apps",
        short_name: "Kabigting",
        description: "The family's Apps behind one sign-in.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: THEME_COLORS.light,
        background_color: THEME_COLORS.light,
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Only the app shell is cached; data always comes from the network.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
    versionFile(),
    themeScript(),
  ],
  resolve: {
    alias: { "@": path("./src/client"), "@shared": path("./src/shared") },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist/client", emptyOutDir: true },
}))
