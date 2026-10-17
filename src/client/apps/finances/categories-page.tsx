import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { NameDialog } from "@/apps/finances/name-dialog"
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button className="h-11" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <CategoryList
          categories={categories}
          onUnarchive={(category) => setCategoryArchived(category.id, false)}
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

export function CategoryList({
  categories,
  onUnarchive,
}: {
  categories: readonly Category[]
  onUnarchive: (category: Category) => void
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
            <span
              className={
                category.archived ? "truncate text-muted-foreground" : "truncate font-medium"
              }
            >
              {category.name}
            </span>
            {category.archived ? (
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {category.mergedIntoId ? "Merged" : "Archived"}
              </span>
            ) : null}
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
