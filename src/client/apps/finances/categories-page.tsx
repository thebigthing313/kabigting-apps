import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { PlusIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { StateMark } from "@/apps/finances/categories/state-mark"
import { NameDialog } from "@/components/name-dialog"
import { FinancesHeader } from "@/apps/finances/finances-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  addCategory,
  type Category,
  setCategoryArchived,
  useCategories,
} from "@/data/finances-categories"

/** Every Category, archived ones marked, with Add and Unarchive. */
export function CategoriesPage() {
  const { data: categories, isLoading } = useCategories()
  const [adding, setAdding] = useState(false)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <FinancesHeader title="Categories">
        <Button className="h-11" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add
        </Button>
      </FinancesHeader>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <CategoryList
          categories={categories}
          onUnarchive={(category) => setCategoryArchived(category.id, false)}
          renderName={(category, className) => (
            <Link
              to="/finances/categories/$categoryId"
              params={{ categoryId: category.id }}
              className={cn(className, "underline-offset-4 hover:underline")}
            >
              {category.name}
            </Link>
          )}
        />
      )}

      <NameDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add Category"
        takenNames={categories.map((category) => category.name)}
        onSave={(name) => {
          addCategory(name)
          setAdding(false)
        }}
      />
    </div>
  )
}

function nameClass(category: Category): string {
  return category.archived ? "truncate text-muted-foreground" : "truncate font-medium"
}

export function CategoryList({
  categories,
  onUnarchive,
  renderName,
}: {
  categories: readonly Category[]
  onUnarchive: (category: Category) => void
  /** Draws a Category's name, such as a link to its page; plain text when absent. */
  renderName?: (category: Category, className: string) => ReactNode
}) {
  if (categories.length === 0) {
    return (
      <p className="rounded-xl border p-6 text-center text-muted-foreground">No Categories yet</p>
    )
  }
  return (
    <ul className="divide-y rounded-xl border" aria-label="Categories">
      {categories.map((category) => (
        <li
          key={category.id}
          className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            {renderName ? (
              renderName(category, nameClass(category))
            ) : (
              <span className={nameClass(category)}>{category.name}</span>
            )}
            <StateMark category={category} />
          </span>
          {/* A merged Category's rows now live under its target, so it stays archived. */}
          {category.archived && !category.mergedIntoId ? (
            <Button
              variant="outline"
              className="h-11 shrink-0"
              aria-label={`Unarchive ${category.name}`}
              onClick={() => onUnarchive(category)}
            >
              Unarchive
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
