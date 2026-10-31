// A toast never covers the floating + button. Under a toast the + can't be tapped, and while a
// pointer rests on a toast its timer stops, so it would stay over the + for good.
import "@/styles.css"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { page } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import { toast } from "sonner"
import { AddButton } from "@/apps/finances/add-button"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/theme/theme-provider"

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ rows: [] }), {
        headers: { "Content-Type": "application/json" },
      }),
  )
})

afterEach(async () => {
  toast.dismiss()
  await cleanup()
  vi.restoreAllMocks()
})

function overlaps(a: DOMRect, b: DOMRect) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

describe.each([
  { screen: "phone", width: 393, height: 852 },
  { screen: "desktop", width: 1280, height: 720 },
])("on a $screen", ({ width, height }) => {
  test("a toast sits clear of the + button", async () => {
    await page.viewport(width, height)
    const screen = await render(
      <ThemeProvider>
        <AddButton />
        <Toaster />
      </ThemeProvider>,
    )
    toast.success("Joined to the Transfer")
    const shown = screen.getByText("Joined to the Transfer")
    await expect.element(shown).toBeVisible()

    const add = screen.getByRole("button", { name: "Add", exact: true }).element()
    const message = shown.element().closest("[data-sonner-toast]")
    expect(message).not.toBeNull()
    // The toast slides in from below; it must come to rest clear of the +.
    await vi.waitFor(() => {
      const box = add.getBoundingClientRect()
      expect(overlaps(box, message?.getBoundingClientRect() ?? new DOMRect())).toBe(false)
      const middle = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      expect(add.contains(middle)).toBe(true)
    })
  })
})
