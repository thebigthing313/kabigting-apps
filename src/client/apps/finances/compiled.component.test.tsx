import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { CategoriesPage, CategoryList } from "@/apps/finances/categories-page"
import { FinancesHome } from "@/apps/finances/finances-home"
import { ScheduleForm } from "@/apps/finances/schedules/schedule-form"
import { SchedulesPage } from "@/apps/finances/schedules/schedules-page"
import { WalletForm } from "@/apps/finances/wallets/wallet-form"
import { WalletPage } from "@/apps/finances/wallets/wallet-page"
import { WalletsPage } from "@/apps/finances/wallets/wallets-page"
import { NameDialog } from "@/apps/finances/name-dialog"
import { NamePicker } from "@/apps/finances/name-picker"
import { AccountPicker, CategoryPicker } from "@/apps/finances/pickers"
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
    ["NamePicker", NamePicker],
    ["NameDialog", NameDialog],
    ["AccountPicker", AccountPicker],
    ["CategoryPicker", CategoryPicker],
    ["CategoriesPage", CategoriesPage],
    ["CategoryList", CategoryList],
    ["AmountInput", AmountInput],
    ["WalletsPage", WalletsPage],
    ["WalletPage", WalletPage],
    ["WalletForm", WalletForm],
    ["SchedulesPage", SchedulesPage],
    ["ScheduleForm", ScheduleForm],
  ])("compiled %s", (_name, component) => {
    expect(isCompiled(component)).toBe(true)
  })
})

test("the empty Finances home says there is nothing here yet", () => {
  const html = renderToStaticMarkup(<FinancesHome />)
  expect(html).toContain("Finances")
  expect(html).toContain("Nothing here yet")
})
