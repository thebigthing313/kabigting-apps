import { createFileRoute } from "@tanstack/react-router"
import { CategoriesPage } from "@/apps/finances/categories-page"

export const Route = createFileRoute("/_app/finances/categories/")({
  component: CategoriesPage,
})
