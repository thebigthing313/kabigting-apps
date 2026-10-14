import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { z } from "zod"

const SW_FILE = "dist/client/sw.js"

test.describe("PWA", () => {
  // Playwright can drive service workers in Chromium only.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "service-worker APIs are Chromium-only",
  )
  test.describe.configure({ mode: "serial" })

  test("the manifest has what install needs", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest")
    expect(response.headers()["cache-control"]).toBe("no-cache")
    const manifest = z
      .object({
        name: z.string(),
        short_name: z.string(),
        id: z.string(),
        start_url: z.string(),
        scope: z.string(),
        display: z.string(),
        icons: z.array(
          z.object({ src: z.string(), sizes: z.string(), purpose: z.string().optional() }),
        ),
      })
      .parse(await response.json())
    expect(manifest).toMatchObject({
      name: "Kabigting Apps",
      short_name: "Kabigting",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
    })
    const { icons } = manifest
    expect(icons.map((icon) => `${icon.sizes}${icon.purpose ? `-${icon.purpose}` : ""}`)).toEqual(
      expect.arrayContaining(["192x192", "512x512", "512x512-maskable"]),
    )
    for (const icon of icons) expect((await request.get(`/${icon.src}`)).ok()).toBe(true)
  })

  test("the service worker installs, controls the page and opens the shell offline", async ({
    page,
    context,
  }) => {
    await page.goto("/sign-in")
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible()
    await context.setOffline(false)
    await page.getByRole("button", { name: "Try again" }).click()
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
  })

  test("a new deploy shows the update toast and Reload switches to it", async ({ page }) => {
    await page.goto("/sign-in")
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    // A returning visitor: the installed worker controls the page.
    await page.reload()
    const original = await readFile(SW_FILE, "utf8")
    try {
      // A deploy changes the worker script's bytes; that is what the browser compares.
      await writeFile(SW_FILE, `${original}\n// next deploy ${Date.now()}\n`)
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update()
      })
      await expect(page.getByText("Update available")).toBeVisible()

      const reloaded = page.waitForEvent("load")
      await page.getByRole("button", { name: "Reload" }).click()
      await reloaded
      expect(
        await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration()
          return registration?.waiting === null && navigator.serviceWorker.controller !== null
        }),
      ).toBe(true)
    } finally {
      await writeFile(SW_FILE, original)
    }
  })

  test("the precache holds only the shell", async ({ request }) => {
    const sw = await (await request.get("/sw.js")).text()
    const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1] ?? "")
    expect(urls).toContain("index.html")
    expect(urls.filter((url) => url.includes("api") || url.endsWith(".map"))).toEqual([])
    expect(sw).toContain("denylist:[/^\\/api\\//]")
  })
})
