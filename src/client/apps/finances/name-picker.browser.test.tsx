import { useState } from "react"
import { describe, expect, test } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NamePicker, type PickerOption } from "@/apps/finances/name-picker"

const START: PickerOption[] = [
  { id: "11111111-1111-7111-8111-111111111111", name: "Groceries", archived: false },
  { id: "22222222-2222-7222-8222-222222222222", name: "Dining Out", archived: false },
  { id: "33333333-3333-7333-8333-333333333333", name: "Old Club", archived: true },
]

/** Stands in for a form: keeps the options and the picked id, and shows what was asked for. */
function Harness({ initial = null, lag = 0 }: { initial?: string | null; lag?: number }) {
  const [options, setOptions] = useState(START)
  const [value, setValue] = useState<string | null>(initial)
  const [added, setAdded] = useState<string[]>([])
  return (
    <>
      <label htmlFor="category">Category</label>
      <NamePicker
        id="category"
        noun="Category"
        options={options}
        value={value}
        onValueChange={setValue}
        onAdd={(name) => {
          const id = `44444444-4444-7444-8444-44444444444${added.length}`
          setAdded([...added, name])
          // A live query may deliver the new row a moment after the add.
          const next = [...options, { id, name, archived: false }]
          if (lag === 0) setOptions(next)
          else setTimeout(() => setOptions(next), lag)
          return id
        }}
        onRename={(id, name) => {
          setOptions(options.map((option) => (option.id === id ? { ...option, name } : option)))
        }}
      />
      <output data-testid="value">{value ?? "none"}</output>
      <output data-testid="added">{added.join(",")}</output>
    </>
  )
}

describe("NamePicker", () => {
  test("adds a typed name inline and picks it", async () => {
    const screen = await render(<Harness />)
    await userEvent.fill(screen.getByLabelText("Category"), "Gym")
    await screen.getByRole("option", { name: 'Add "Gym"' }).click()
    await expect.element(screen.getByTestId("added")).toHaveTextContent("Gym")
    await expect
      .element(screen.getByTestId("value"))
      .toHaveTextContent("44444444-4444-7444-8444-444444444440")
    await expect.element(screen.getByLabelText("Category")).toHaveValue("Gym")
  })

  test("keeps showing an added name while the list catches up", async () => {
    const screen = await render(<Harness lag={200} />)
    await userEvent.fill(screen.getByLabelText("Category"), "Gym")
    await screen.getByRole("option", { name: 'Add "Gym"' }).click()
    await expect.element(screen.getByLabelText("Category")).toHaveValue("Gym")
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect.element(screen.getByLabelText("Category")).toHaveValue("Gym")
  })

  test("offers no Add when the typed name already exists, in any case", async () => {
    const screen = await render(<Harness />)
    await userEvent.fill(screen.getByLabelText("Category"), "groceries")
    await expect.element(screen.getByRole("option", { name: "Groceries" })).toBeVisible()
    await expect.element(screen.getByRole("option", { name: /^Add/ })).not.toBeInTheDocument()
    await screen.getByRole("option", { name: "Groceries" }).click()
    await expect.element(screen.getByTestId("value")).toHaveTextContent(START[0]!.id)
    await expect.element(screen.getByTestId("added")).toHaveTextContent("")
  })

  test("hides archived entries", async () => {
    const screen = await render(<Harness />)
    await userEvent.fill(screen.getByLabelText("Category"), "Old")
    await expect.element(screen.getByRole("option", { name: 'Add "Old"' })).toBeVisible()
    await expect.element(screen.getByRole("option", { name: "Old Club" })).not.toBeInTheDocument()
  })

  test("renames the picked entry from a small dialog", async () => {
    const screen = await render(<Harness initial={START[1]!.id} />)
    await expect.element(screen.getByLabelText("Category")).toHaveValue("Dining Out")
    await screen.getByRole("button", { name: "Rename Category" }).click()
    const dialog = screen.getByRole("dialog")
    await userEvent.fill(dialog.getByLabelText("Name"), "Restaurants")
    await userEvent.keyboard("{Enter}")
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument()
    await expect.element(screen.getByLabelText("Category")).toHaveValue("Restaurants")
    await expect.element(screen.getByTestId("value")).toHaveTextContent(START[1]!.id)
  })
})
