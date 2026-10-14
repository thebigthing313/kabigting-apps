import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config"

const OLIVE_600 = "#5b5b4b"

// minimal-2023 sizes, but the maskable and Apple icons are filled edge to edge with Olive
// (the "K" already sits inside the maskable safe zone) instead of the preset's white padding.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0,
      resizeOptions: { background: OLIVE_600 },
    },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: OLIVE_600 } },
  },
  images: ["public/logo.svg"],
})
