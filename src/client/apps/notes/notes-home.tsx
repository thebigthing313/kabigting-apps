import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { NotesList } from "@/apps/notes/notes-list"
import { Skeleton } from "@/components/ui/skeleton"
import { useItems, useNotes } from "@/data/notes"
import { newId } from "@shared/ids"
import type { NoteTab } from "@shared/notes/notes"

const appRoute = getRouteApi("/_app")

/**
 * The Notes App's home: every Note the Account can see, its own and those shared with it, in the
 * tab picked.
 */
export function NotesHome({ tab }: { tab: NoteTab }) {
  const { session } = appRoute.useRouteContext()
  const { data: notes, isLoading } = useNotes()
  const { data: items, isLoading: itemsLoading } = useItems()
  const navigate = useNavigate()
  if (isLoading || itemsLoading) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />
  return (
    <NotesList
      notes={notes}
      viewerId={session.user.id}
      items={items}
      tab={tab}
      // All is the default, so it keeps the plain /notes address.
      onTab={(picked) =>
        void navigate({ to: "/notes", search: picked === "all" ? {} : { tab: picked } })
      }
      // A new Note gets its id now but exists only on this device until it has content.
      onNew={(kind) =>
        void navigate({ to: "/notes/$noteId", params: { noteId: newId() }, search: { new: kind } })
      }
      onOpen={(noteId) => void navigate({ to: "/notes/$noteId", params: { noteId } })}
    />
  )
}
