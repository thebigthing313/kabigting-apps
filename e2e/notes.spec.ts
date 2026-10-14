import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

test("a note can be added, edited and deleted, and survives a reload", async ({
  page,
}, testInfo) => {
  const text = `e2e ${testInfo.project.name} ${Date.now()}`
  await page.goto("/skeleton")
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible()

  await page.getByRole("button", { name: "New note" }).click()
  await page.getByLabel("Note", { exact: true }).fill(text)
  await page.getByLabel("Amount").fill("-1,250.5")
  await page.getByRole("button", { name: "Add note" }).click()
  const row = page.getByRole("listitem").or(page.getByRole("row")).filter({ hasText: text })
  await expect(row.filter({ visible: true })).toContainText("-$1,250.50")

  await page.reload()
  await expect(row.filter({ visible: true })).toContainText("-$1,250.50")

  await page
    .getByRole("button", { name: `Edit ${text}` })
    .filter({ visible: true })
    .click()
  await page.getByLabel("Amount").fill("75")
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(row.filter({ visible: true })).toContainText("+$75.00")

  await page
    .getByRole("button", { name: `Delete ${text}` })
    .filter({ visible: true })
    .click()
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByText(text)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible()
  await expect(page.getByText(text)).toHaveCount(0)
})

test("a write the server refuses is rolled back with a message", async ({ page }, testInfo) => {
  const text = `refused ${testInfo.project.name} ${Date.now()}`
  await page.goto("/skeleton")
  await page.route("**/api/skeleton/notes", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "internal", message: "Simulated failure" } }),
        })
      : route.continue(),
  )
  await page.getByRole("button", { name: "New note" }).click()
  await page.getByLabel("Note", { exact: true }).fill(text)
  await page.getByLabel("Amount").fill("1")
  await page.getByRole("button", { name: "Add note" }).click()
  await expect(page.getByText("Saving failed")).toBeVisible()
  await expect(page.getByText(text)).toHaveCount(0)
})
