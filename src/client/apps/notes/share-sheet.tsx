import { Avatar } from "@/apps/notes/note-parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { NotePerson } from "@shared/notes/schemas"

export type ShareSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Who the Note is shared with now. */
  audience: readonly NotePerson[]
  /** Everyone else holding App access to Notes; undefined while loading. */
  people: readonly NotePerson[] | undefined
  /** Called with the whole new Audience on every tick or untick. */
  onShare: (audience: NotePerson[]) => void
}

/**
 * The Creator's bottom sheet for who sees a Note: a checkbox per person with access to Notes.
 * Each tick saves at once. Members the people list leaves out are still listed, so they can be
 * removed.
 */
export function ShareSheet({ open, onOpenChange, audience, people, onShare }: ShareSheetProps) {
  const chosen = new Set(audience.map((person) => person.id))
  const offered = people ?? []
  const offeredIds = new Set(offered.map((person) => person.id))
  const listed = [...offered, ...audience.filter((person) => !offeredIds.has(person.id))]
  const toggle = (person: NotePerson, checked: boolean) =>
    onShare(checked ? [...audience, person] : audience.filter((member) => member.id !== person.id))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Who can see this note</SheetTitle>
          <SheetDescription>
            Everyone you pick can read and edit it. Only you can change this or delete the note.
          </SheetDescription>
        </SheetHeader>
        {people === undefined && listed.length === 0 ? (
          <Skeleton className="mx-4 h-24" />
        ) : listed.length === 0 ? (
          <p className="px-4 text-muted-foreground">Nobody else has access to Notes yet.</p>
        ) : (
          <ul className="flex max-h-[50vh] flex-col overflow-y-auto px-4">
            {listed.map((person) => (
              <li key={person.id}>
                <label className="flex items-center gap-3 py-2.5 text-base">
                  <Avatar person={person} className="size-8 text-sm" />
                  <span className="flex-1">{person.name}</span>
                  <Checkbox
                    aria-label={person.name}
                    className="size-5"
                    checked={chosen.has(person.id)}
                    onCheckedChange={(checked) => toggle(person, checked)}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
        <SheetFooter>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
