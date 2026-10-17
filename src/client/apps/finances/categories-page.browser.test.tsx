import { useState } from "react"
import { expect, test } from "vitest"
import { render } from "vitest-browser-react"
import { CategoryList } from "@/apps/finances/categories-page"
import type { Category } from "@/data/finances-categories"

function category(id: string, name: string, archived: boolean): Category {
  return {
    id,
    name,
    archived,
    mergedIntoId: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  }
}

function Harness() {
  const [categories, setCategories] = useState([
    category("11111111-1111-7111-8111-111111111111", "Groceries", false),
    category("22222222-2222-7222-8222-222222222222", "Old Club", true),
    {
      ...category("33333333-3333-7333-8333-333333333333", "Takeaway", true),
      mergedIntoId: "11111111-1111-7111-8111-111111111111",
    },
  ])
  return (
    <CategoryList
      categories={categories}
      onUnarchive={(picked) =>
        setCategories(categories.map((c) => (c.id === picked.id ? { ...c, archived: false } : c)))
      }
    />
  )
}

test("lists every Category, marks archived ones, and unarchives them", async () => {
  const screen = await render(<Harness />)
  const rows = screen.getByRole("listitem")
  await expect.element(rows.nth(0).getByText("Groceries")).toBeVisible()
  await expect.element(rows.nth(0).getByText("Archived", { exact: true })).not.toBeInTheDocument()
  await expect.element(rows.nth(1).getByText("Old Club")).toBeVisible()
  await expect.element(rows.nth(1).getByText("Archived", { exact: true })).toBeVisible()
  await expect
    .element(screen.getByRole("button", { name: "Unarchive Groceries" }))
    .not.toBeInTheDocument()

  await expect.element(rows.nth(2).getByText("Merged", { exact: true })).toBeVisible()
  await expect
    .element(screen.getByRole("button", { name: "Unarchive Takeaway" }))
    .not.toBeInTheDocument()

  await screen.getByRole("button", { name: "Unarchive Old Club" }).click()
  await expect.element(screen.getByText("Archived", { exact: true })).not.toBeInTheDocument()
  await expect.element(screen.getByRole("button", { name: /Unarchive/ })).not.toBeInTheDocument()
})

test("says so when there are no Categories", async () => {
  const screen = await render(<CategoryList categories={[]} onUnarchive={() => {}} />)
  await expect.element(screen.getByText("No Categories yet")).toBeVisible()
})
