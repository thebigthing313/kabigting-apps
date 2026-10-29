// PROTOTYPE, throwaway. Variant A: one list of rows with Mine / Shared filters; a Note opens as
// its own full page. Items reorder by dragging a handle; checked Items fold under a disclosure.
// The creator shares from a bottom sheet; others see who shared it and can Leave.
import { cn } from "cn"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  GripVerticalIcon,
  MoreVerticalIcon,
  PlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { Avatar, AvatarStack, displayTitle, KindIcon } from "@/apps/notes/prototype/common"
import {
  ACCOUNTS,
  accountName,
  orderedItems,
  relativeTime,
  sharingLine,
  type Note,
  type NotesStore,
} from "@/apps/notes/prototype/store"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type Filter = "all" | "mine" | "shared"

export function VariantA({ store }: { store: NotesStore }) {
  const [openId, setOpenId] = useState<string>()
  const note = store.find(openId)
  if (note)
    return (
      <Editor
        note={note}
        store={store}
        onBack={() => {
          store.discardIfEmpty(note.id)
          setOpenId(undefined)
        }}
      />
    )
  return <List store={store} onOpen={setOpenId} />
}

function List({ store, onOpen }: { store: NotesStore; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all")
  const shown = store.notes.filter((note) =>
    filter === "all" ? true : (note.creatorId === store.viewerId) === (filter === "mine"),
  )
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-20">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">Notes</h1>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="lg" />}>
            <PlusIcon /> New
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpen(store.create("text"))}>
              <KindIcon kind="text" /> Text note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpen(store.create("checklist"))}>
              <KindIcon kind="checklist" /> Checklist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
        {(
          [
            ["all", "All"],
            ["mine", "Mine"],
            ["shared", "Shared with me"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 font-medium",
              filter === key ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="divide-y rounded-xl border">
        {shown.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onOpen(note.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50"
            >
              <KindIcon kind={note.kind} className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{displayTitle(note)}</span>
                <span className="truncate text-sm text-muted-foreground">{preview(note)}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {note.creatorId !== store.viewerId ? (
                    <Avatar id={note.creatorId} className="size-4 text-[0.55rem] ring-1" />
                  ) : note.audience.length > 0 ? (
                    <UsersIcon className="size-3.5" />
                  ) : null}
                  {sharingLine(note, store.viewerId)} · {relativeTime(note.updatedAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-4 py-8 text-center text-muted-foreground">No notes here yet.</li>
        )}
      </ul>
    </div>
  )
}

function preview(note: Note): string {
  if (note.kind === "text") return note.body.replace(/\s+/g, " ").trim() || "Empty"
  const { unchecked, checked } = orderedItems(note)
  if (note.items.length === 0) return "No items"
  return `${unchecked.length} to do · ${checked.length} done — ${unchecked.map((i) => i.text).join(", ")}`
}

function Editor({ note, store, onBack }: { note: Note; store: NotesStore; onBack: () => void }) {
  const [sharing, setSharing] = useState(false)
  const isCreator = note.creatorId === store.viewerId
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 pb-20">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-lg" aria-label="Back to notes" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <span className="flex-1" />
        {isCreator ? (
          <Button variant="outline" size="lg" onClick={() => setSharing(true)}>
            {note.audience.length > 0 ? <AvatarStack ids={note.audience} /> : <UsersIcon />}
            {note.audience.length > 0 ? "Shared" : "Share"}
          </Button>
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar id={note.creatorId} /> Shared by {accountName(note.creatorId)}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="More" />}>
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isCreator ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  store.remove(note.id)
                  onBack()
                }}
              >
                Delete note
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  store.leave(note.id)
                  onBack()
                }}
              >
                Leave note
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input
        value={note.title}
        onChange={(event) => store.setTitle(note.id, event.target.value)}
        placeholder="Title"
        className="bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
      />
      {note.kind === "text" ? (
        <textarea
          value={note.body}
          onChange={(event) => store.setBody(note.id, event.target.value)}
          placeholder="Note"
          autoFocus={note.body === ""}
          className="min-h-[50vh] resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
      ) : (
        <DragChecklist note={note} store={store} />
      )}
      <p className="text-xs text-muted-foreground">Edited {relativeTime(note.updatedAt)}</p>
      {isCreator && (
        <AudienceSheet note={note} store={store} open={sharing} onOpenChange={setSharing} />
      )}
    </div>
  )
}

function DragChecklist({ note, store }: { note: Note; store: NotesStore }) {
  const { unchecked, checked } = orderedItems(note)
  const [showChecked, setShowChecked] = useState(true)
  const [dragging, setDragging] = useState<string>()
  const [draft, setDraft] = useState("")
  const listRef = useRef<HTMLUListElement>(null)

  // Touch-friendly drag: the handle captures the pointer, and the Item moves to whichever row
  // the pointer is over.
  const onMove = (event: React.PointerEvent, itemId: string) => {
    if (dragging !== itemId) return
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])]
    const index = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect()
      return event.clientY >= rect.top && event.clientY < rect.bottom
    })
    const current = unchecked.findIndex((item) => item.id === itemId)
    if (index >= 0 && index !== current) store.moveItem(note.id, itemId, index)
  }

  return (
    <div className="flex flex-col">
      <ul ref={listRef} className="flex flex-col">
        {unchecked.map((item) => (
          <li
            key={item.id}
            data-row
            className={cn(
              "group flex items-center gap-2 rounded-md py-1",
              dragging === item.id && "bg-muted shadow-sm",
            )}
          >
            <span
              className="flex size-9 cursor-grab touch-none items-center justify-center text-muted-foreground"
              aria-label="Drag to reorder"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(item.id)
              }}
              onPointerMove={(event) => onMove(event, item.id)}
              onPointerUp={() => setDragging(undefined)}
            >
              <GripVerticalIcon className="size-4" />
            </span>
            <Checkbox
              className="size-5"
              checked={false}
              onCheckedChange={() => store.toggleItem(note.id, item.id)}
            />
            <input
              value={item.text}
              onChange={(event) => store.setItemText(note.id, item.id, event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete item"
              className="opacity-60 md:opacity-0 md:group-hover:opacity-100"
              onClick={() => store.deleteItem(note.id, item.id)}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 py-1 pl-11"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim()) return
          store.addItem(note.id, draft.trim())
          setDraft("")
        }}
      >
        <PlusIcon className="size-5 text-muted-foreground" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add item"
          autoFocus={note.items.length === 0}
          className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-muted-foreground/60"
        />
      </form>
      {checked.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setShowChecked((value) => !value)}
              className="flex flex-1 items-center gap-1 py-2 text-sm text-muted-foreground"
            >
              <ChevronDownIcon className={cn("size-4 transition", !showChecked && "-rotate-90")} />
              {checked.length} checked
            </button>
            <Button variant="ghost" size="sm" onClick={() => store.clearChecked(note.id)}>
              Clear checked
            </Button>
          </div>
          {showChecked && (
            <ul className="flex flex-col">
              {checked.map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-1 pl-11">
                  <Checkbox
                    className="size-5"
                    checked
                    onCheckedChange={() => store.toggleItem(note.id, item.id)}
                  />
                  <span className="flex-1 py-1 text-base text-muted-foreground line-through">
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function AudienceSheet({
  note,
  store,
  open,
  onOpenChange,
}: {
  note: Note
  store: NotesStore
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const others = ACCOUNTS.filter((account) => account.id !== store.viewerId)
  const toggle = (id: string) =>
    store.setAudience(
      note.id,
      note.audience.includes(id) ? note.audience.filter((a) => a !== id) : [...note.audience, id],
    )
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Who can see this note</SheetTitle>
          <SheetDescription>
            Everyone you pick can read and edit it. Only you can change this or delete the note.
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col px-4">
          {others.map((account) => (
            <li key={account.id}>
              <label className="flex items-center gap-3 py-2.5 text-base">
                <Avatar id={account.id} className="size-8 text-sm" />
                <span className="flex-1">{account.name}</span>
                <Checkbox
                  className="size-5"
                  checked={note.audience.includes(account.id)}
                  onCheckedChange={() => toggle(account.id)}
                />
              </label>
            </li>
          ))}
        </ul>
        <SheetFooter>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
