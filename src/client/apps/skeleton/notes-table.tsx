import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { PencilIcon, Trash2Icon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Note } from "@/data/skeleton-notes"
import { cn } from "@/lib/utils"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"

/** Amounts always carry an explicit sign; colour is only a second cue. */
export function SignedAmount({ cents }: { cents: number }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        cents < 0 && "text-destructive",
        cents > 0 && "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {format(cents, { sign: "always" })}
    </span>
  )
}

type Actions = { onEdit: (note: Note) => void; onDelete: (note: Note) => void }

function RowActions({ note, onEdit, onDelete }: { note: Note } & Actions) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" className="size-11" onClick={() => onEdit(note)}>
        <PencilIcon />
        <span className="sr-only">Edit {note.text}</span>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="icon" className="size-11" />}>
          <Trash2Icon />
          <span className="sr-only">Delete {note.text}</span>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>“{note.text}” will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-11"
              onClick={() => onDelete(note)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Note>()
const columns = helper.columns([
  helper.accessor("onDate", { header: "Date" }),
  helper.accessor("text", { header: "Note" }),
  helper.accessor("amountCents", { header: "Amount" }),
])

/** A real table on wide screens, a list of rows on phones. */
export function NotesTable({ notes, onEdit, onDelete }: { notes: Note[] } & Actions) {
  const table = useTable({ features, columns, data: notes })
  const rows = table.getRowModel().rows

  return (
    <>
      <ul className="divide-y rounded-xl border md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 py-2 pl-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.original.text}</p>
              <p className="text-sm text-muted-foreground">
                {formatDisplayDate(row.original.onDate)}
              </p>
            </div>
            <SignedAmount cents={row.original.amountCents} />
            <RowActions note={row.original} onEdit={onEdit} onDelete={onDelete} />
          </li>
        ))}
      </ul>

      <div className="hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36 pl-4">Date</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-40 text-right">Amount</TableHead>
              <TableHead className="w-28">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="pl-4">{formatDisplayDate(row.original.onDate)}</TableCell>
                <TableCell className="max-w-0 truncate">{row.original.text}</TableCell>
                <TableCell className="text-right">
                  <SignedAmount cents={row.original.amountCents} />
                </TableCell>
                <TableCell>
                  <RowActions note={row.original} onEdit={onEdit} onDelete={onDelete} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
