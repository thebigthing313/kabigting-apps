import { describe, expect, test } from "vitest"
import { NoteForm } from "@/apps/skeleton/note-form"
import { NotesPage } from "@/apps/skeleton/notes-page"
import { NotesTable, SignedAmount } from "@/apps/skeleton/notes-table"
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
    ["NotesPage (uses useLiveQuery)", NotesPage],
    ["NotesTable", NotesTable],
    ["SignedAmount", SignedAmount],
    ["NoteForm", NoteForm],
    ["AmountInput", AmountInput],
  ])("compiled %s", (_name, component) => {
    expect(isCompiled(component)).toBe(true)
  })
})
