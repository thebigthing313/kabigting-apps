import type { Category } from "@/data/finances-categories"

/** "Archived" or "Merged" beside an archived Category's name; nothing for one in use. */
export function StateMark({ category }: { category: Category }) {
  if (!category.archived) return null
  return (
    <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      {category.mergedIntoId ? "Merged" : "Archived"}
    </span>
  )
}
