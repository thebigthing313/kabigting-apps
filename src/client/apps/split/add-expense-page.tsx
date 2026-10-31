import { getRouteApi } from "@tanstack/react-router"
import { useState } from "react"
import { useEntryForm } from "@/apps/split/entry-form"
import { ExpenseFlow } from "@/apps/split/expense-flow"
import { Skeleton } from "@/components/ui/skeleton"
import { addExpense, useCategories, useMembers } from "@/data/split"
import { today } from "@shared/dates"
import { newId } from "@shared/ids"

const appRoute = getRouteApi("/_app")

/**
 * Adding an Expense, full page. Its id is made once, when the page opens, so trying a save again
 * never stores it twice; the draft lives only here, for as long as the page is open.
 */
export function AddExpensePage() {
  const { session } = appRoute.useRouteContext()
  const members = useMembers()
  const categories = useCategories()
  const entry = useEntryForm("Expense")
  const [id] = useState(newId)
  const [startedOn] = useState(today)
  if (!members.data || !categories.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  const memberIds = members.data.map((member) => member.id)
  return (
    <ExpenseFlow
      viewerId={session.user.id}
      members={members.data}
      categories={categories.data.filter((category) => !category.archived)}
      today={startedOn}
      notice={entry.notice}
      onCancel={entry.leave}
      onSave={(expense) =>
        entry.save(() => addExpense({ id, ...expense }, session.user.id, memberIds))
      }
    />
  )
}
