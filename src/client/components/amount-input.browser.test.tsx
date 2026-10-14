import { useState } from "react"
import { describe, expect, test } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { AmountInput } from "@/components/amount-input"

function Harness({ initial = null }: { initial?: number | null }) {
  const [cents, setCents] = useState<number | null>(initial)
  return (
    <>
      <label>
        Amount
        <AmountInput value={cents} onValueChange={setCents} />
      </label>
      <output data-testid="cents">{cents === null ? "none" : String(cents)}</output>
      <button type="button">elsewhere</button>
    </>
  )
}

describe("AmountInput", () => {
  test("turns a typed decimal into cents and tidies it on blur", async () => {
    const screen = await render(<Harness />)
    const input = screen.getByLabelText("Amount")
    await userEvent.fill(input, "1,250.5")
    await expect.element(screen.getByTestId("cents")).toHaveTextContent("125050")
    await screen.getByRole("button", { name: "elsewhere" }).click()
    await expect.element(input).toHaveValue("$1,250.50")
  })

  test("keeps a negative sign for money out", async () => {
    const screen = await render(<Harness />)
    const input = screen.getByLabelText("Amount")
    await userEvent.fill(input, "-45.2")
    await screen.getByRole("button", { name: "elsewhere" }).click()
    await expect.element(input).toHaveValue("-$45.20")
    await expect.element(screen.getByTestId("cents")).toHaveTextContent("-4520")
  })

  test("reports no value for more than two decimals and leaves the text for fixing", async () => {
    const screen = await render(<Harness />)
    const input = screen.getByLabelText("Amount")
    await userEvent.fill(input, "12.345")
    await screen.getByRole("button", { name: "elsewhere" }).click()
    await expect.element(input).toHaveValue("12.345")
    await expect.element(screen.getByTestId("cents")).toHaveTextContent("none")
  })

  test("shows an existing amount formatted", async () => {
    const screen = await render(<Harness initial={-99} />)
    await expect.element(screen.getByLabelText("Amount")).toHaveValue("-$0.99")
  })

  test("opens the decimal keypad on phones", async () => {
    const screen = await render(<Harness />)
    await expect.element(screen.getByLabelText("Amount")).toHaveAttribute("inputmode", "decimal")
  })
})
