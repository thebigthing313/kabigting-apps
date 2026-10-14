import { fileURLToPath } from "node:url"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
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

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
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
})
