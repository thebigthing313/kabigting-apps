import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { addNote, deleteNote, editNote, type Note, useNotes } from "@/data/skeleton-notes"
import { hasNewNoteDraft, NoteForm } from "@/apps/skeleton/note-form"
import { NotesTable, SignedAmount } from "@/apps/skeleton/notes-table"

type Editing = { mode: "closed" } | { mode: "create" } | { mode: "edit"; note: Note }

/** The skeleton App: notes read through the client cache, written optimistically. */
export function NotesPage() {
  const { data: notes, isLoading } = useNotes()
  // After an update reload, reopen the new-note form that was being typed.
  const [editing, setEditing] = useState<Editing>(() =>
    hasNewNoteDraft() ? { mode: "create" } : { mode: "closed" },
  )
  const total = notes.reduce((sum, note) => sum + note.amountCents, 0)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notes</h1>
          <p className="text-sm text-muted-foreground">
            Balance <SignedAmount cents={total} />
          </p>
        </div>
        <Button className="h-11" onClick={() => setEditing({ mode: "create" })}>
          <PlusIcon />
          New note
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : notes.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          No notes yet. Add one to see it saved through the client cache.
        </p>
      ) : (
        <NotesTable
          notes={notes}
          onEdit={(note) => setEditing({ mode: "edit", note })}
          onDelete={(note) => void deleteNote(note.id)}
        />
      )}

      <Dialog
        open={editing.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setEditing({ mode: "closed" })
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing.mode === "edit" ? "Edit note" : "New note"}</DialogTitle>
            <DialogDescription>Saved at once; undone if the server refuses it.</DialogDescription>
          </DialogHeader>
          {editing.mode === "edit" ? (
            <NoteForm
              key={editing.note.id}
              initial={editing.note}
              submitLabel="Save changes"
              onSave={(changes) => {
                void editNote(editing.note.id, changes)
                setEditing({ mode: "closed" })
              }}
            />
          ) : (
            <NoteForm
              submitLabel="Add note"
              onSave={(note) => {
                void addNote(note)
                setEditing({ mode: "closed" })
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
