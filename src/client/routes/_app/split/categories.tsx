import { createFileRoute } from "@tanstack/react-router"
import { CategoriesPage } from "@/apps/split/categories-page"

export const Route = createFileRoute("/_app/split/categories")({
  component: CategoriesPage,
})
