import { useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { NameDialog } from "@/components/name-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  addCategory,
  type Category,
  renameCategory,
  setCategoryArchived,
  useCategories,
} from "@/data/split"

/**
 * The household's Categories, shared by every Member: add, rename and archive. An archived one
 * stays on its Expenses but isn't offered on new ones; there is no delete.
 */
export function CategoriesPage() {
  const { data: categories } = useCategories()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Category | null>(null)
  if (!categories) return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  const takenNames = categories.map((category) => category.name)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => void navigate({ to: "/split" })}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-lg font-semibold">Categories</h1>
        <Button className="ml-auto h-11" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Every Member shares these. An archived Category stays on its Expenses but isn't offered on
        new ones.
      </p>
      <CategoryList
        label="In use"
        categories={categories.filter((category) => !category.archived)}
        empty="No Categories in use"
        onRename={setRenaming}
      />
      <CategoryList
        label="Archived"
        categories={categories.filter((category) => category.archived)}
        empty="None archived"
        onRename={setRenaming}
      />

      <NameDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add Category"
        takenNames={takenNames}
        onSave={(name) => {
          void addCategory(name)
          setAdding(false)
        }}
      />
      <NameDialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        title="Rename Category"
        initialName={renaming?.name ?? ""}
        takenNames={takenNames}
        onSave={(name) => {
          if (renaming) void renameCategory(renaming.id, name)
          setRenaming(null)
        }}
      />
    </div>
  )
}

function CategoryList({
  label,
  categories,
  empty,
  onRename,
}: {
  label: string
  categories: readonly Category[]
  empty: string
  onRename: (category: Category) => void
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{label}</h2>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {categories.map((category) => (
            <li key={category.id} className="flex min-h-12 items-center gap-2 px-4 py-2">
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              <Button
                variant="outline"
                className="h-11 shrink-0"
                aria-label={`Rename ${category.name}`}
                onClick={() => onRename(category)}
              >
                Rename
              </Button>
              <Button
                variant="outline"
                className="h-11 shrink-0"
                aria-label={`${category.archived ? "Unarchive" : "Archive"} ${category.name}`}
                onClick={() => void setCategoryArchived(category.id, !category.archived)}
              >
                {category.archived ? "Unarchive" : "Archive"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
