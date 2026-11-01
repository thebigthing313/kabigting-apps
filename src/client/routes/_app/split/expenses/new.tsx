import { createFileRoute } from "@tanstack/react-router"
import { AddExpensePage } from "@/apps/split/add-expense-page"

export const Route = createFileRoute("/_app/split/expenses/new")({
  component: AddExpensePage,
})
