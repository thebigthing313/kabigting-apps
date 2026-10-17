import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { FinancesHome } from "@/apps/finances/finances-home"
import { AmountInput } from "@/components/amount-input"

// React Compiler rewrites a component to keep values in a memo cache (`$[0] = ...`). A component
// it skipped (a rule violation, or "use no memo") keeps its plain body.
function isCompiled(component: (...args: never[]) => unknown): boolean {
  return /\$\[\d+\] = /.test(component.toString())
}

function NotCompiled() {
  "use no memo"
  return <p>plain</p>
}

describe("React Compiler", () => {
  test("the check can tell a skipped component", () => {
    expect(isCompiled(NotCompiled)).toBe(false)
  })

  test.each([
    ["FinancesHome", FinancesHome],
    ["AmountInput", AmountInput],
  ])("compiled %s", (_name, component) => {
    expect(isCompiled(component)).toBe(true)
  })
})

test("the empty Finances home says there is nothing here yet", () => {
  const html = renderToStaticMarkup(<FinancesHome />)
  expect(html).toContain("Finances")
  expect(html).toContain("Nothing here yet")
})
