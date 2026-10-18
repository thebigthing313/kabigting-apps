import { useNavigate } from "@tanstack/react-router"
import { useId, useState } from "react"
import { toast } from "sonner"
import { selectClass } from "@/apps/finances/form-controls"
import { NameDialog } from "@/apps/finances/name-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  type Category,
  mergeCategory,
  renameCategory,
  setCategoryArchived,
} from "@/data/finances-categories"
import { useSchedules } from "@/data/finances-schedules"
import { useCategoryTransactionCount } from "@/data/finances-transactions"

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/**
 * A Category's actions: Rename, Merge into… and Archive or Unarchive. A merged Category is
 * archived for good, its rows living under its target, so it can only be renamed.
 */
export function CategoryActions({
  category,
  categories,
  month,
}: {
  category: Category
  categories: readonly Category[]
  /** The month the page shows, kept when a merge opens the target's page. */
  month: string
}) {
  const [open, setOpen] = useState<"rename" | "merge" | null>(null)
  const merged = category.mergedIntoId !== null

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="h-11" onClick={() => setOpen("rename")}>
        Rename
      </Button>
      {merged ? null : (
        <>
          <Button variant="outline" className="h-11" onClick={() => setOpen("merge")}>
            Merge into…
          </Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setCategoryArchived(category.id, !category.archived)}
          >
            {category.archived ? "Unarchive" : "Archive"}
          </Button>
        </>
      )}

      <NameDialog
        open={open === "rename"}
        onOpenChange={(next) => setOpen(next ? "rename" : null)}
        title="Rename Category"
        initialName={category.name}
        takenNames={categories.map((each) => each.name)}
        onSave={(name) => {
          renameCategory(category.id, name)
          setOpen(null)
        }}
      />
      <MergeDialog
        open={open === "merge"}
        onOpenChange={(next) => setOpen(next ? "merge" : null)}
        category={category}
        categories={categories}
        month={month}
      />
    </div>
  )
}

function MergeDialog({
  open,
  onOpenChange,
  category,
  categories,
  month,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category
  categories: readonly Category[]
  month: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge {category.name} into…</DialogTitle>
          <DialogDescription>
            Its Transactions and Schedule defaults move to the Category you pick, and it is archived
            as merged. Ignored lines move with them. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the counts load only when asked for. */}
        {open ? (
          <MergeForm
            category={category}
            categories={categories}
            month={month}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MergeForm({
  category,
  categories,
  month,
  onDone,
}: {
  category: Category
  categories: readonly Category[]
  month: string
  onDone: () => void
}) {
  const id = useId()
  const navigate = useNavigate()
  const [intoId, setIntoId] = useState("")
  const [merging, setMerging] = useState(false)
  const { count: transactions, isLoading } = useCategoryTransactionCount(category.id)
  const { data: allSchedules } = useSchedules()
  const schedules = allSchedules.filter((schedule) => schedule.categoryId === category.id).length
  const targets = categories.filter((each) => !each.archived && each.id !== category.id)
  const target = targets.find((each) => each.id === intoId)

  async function merge(into: Category) {
    setMerging(true)
    const done = await mergeCategory(category.id, into.id)
    setMerging(false)
    if (!done) return
    toast.success(`Merged into ${into.name}`)
    onDone()
    await navigate({
      to: "/finances/categories/$categoryId",
      params: { categoryId: into.id },
      search: { month },
    })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (target) void merge(target)
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>Merge into</FieldLabel>
        <select
          id={id}
          className={selectClass}
          value={intoId}
          onChange={(event) => setIntoId(event.target.value)}
        >
          <option value="">Pick a Category</option>
          {targets.map((each) => (
            <option key={each.id} value={each.id}>
              {each.name}
            </option>
          ))}
        </select>
        <FieldDescription aria-live="polite">
          {isLoading
            ? "Counting what moves…"
            : `Moves ${counted(transactions, "Transaction")} and ${counted(schedules, "Schedule")}${
                target ? ` to ${target.name}` : ""
              }.`}
        </FieldDescription>
      </Field>
      <DialogFooter>
        <Button
          type="submit"
          variant="destructive"
          className="h-11"
          disabled={!target || isLoading || merging}
        >
          Merge
        </Button>
      </DialogFooter>
    </form>
  )
}
