// PROTOTYPE, throwaway. Variant C: a split pane on desktop (list left, open Note right) that
// collapses to list-then-Note on a phone. The list is grouped into Yours and Shared with you. A
// whole Item row drags to reorder (desktop), or Alt+↑/↓ while typing in it. The Audience lives
// in a popover from the editor's toolbar, which for anyone but the creator only lists names.
import { cn } from "cn"
import { ArrowLeftIcon, LockIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { Avatar, AvatarStack, displayTitle, KindIcon } from "@/apps/notes/prototype/common"
import {
  ACCOUNTS,
  accountName,
  orderedItems,
  relativeTime,
  type Note,
  type NotesStore,
} from "@/apps/notes/prototype/store"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function VariantC({ store }: { store: NotesStore }) {
  const [openId, setOpenId] = useState<string | undefined>(store.notes[0]?.id)
  const note = store.find(openId)
  const open = (id: string | undefined) => {
    if (note) store.discardIfEmpty(note.id)
    setOpenId(id)
  }
  const yours = store.notes.filter((n) => n.creatorId === store.viewerId)
  const shared = store.notes.filter((n) => n.creatorId !== store.viewerId)
  return (
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] md:-m-6">
      <aside
        className={cn(
          "flex w-full flex-col border-r md:w-80 md:shrink-0",
          note && "hidden md:flex",
        )}
      >
        <div className="flex items-center gap-1 border-b p-3">
          <h1 className="flex-1 text-xl font-semibold">Notes</h1>
          <Button variant="outline" onClick={() => open(store.create("text"))}>
            <PlusIcon /> Text
          </Button>
          <Button variant="outline" onClick={() => open(store.create("checklist"))}>
            <PlusIcon /> Checklist
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pb-20">
          <Section title="Yours" notes={yours} store={store} openId={openId} onOpen={open} />
          <Section
            title="Shared with you"
            notes={shared}
            store={store}
            openId={openId}
            onOpen={open}
          />
        </div>
      </aside>
      <section className={cn("min-w-0 flex-1 flex-col", note ? "flex" : "hidden md:flex")}>
        {note ? (
          <Editor note={note} store={store} onBack={() => open(undefined)} />
        ) : (
          <p className="m-auto text-muted-foreground">Pick a note, or start a new one.</p>
        )}
      </section>
    </div>
  )
}

function Section({
  title,
  notes,
  store,
  openId,
  onOpen,
}: {
  title: string
  notes: Note[]
  store: NotesStore
  openId: string | undefined
  onOpen: (id: string) => void
}) {
  return (
    <div className="py-2">
      <h2 className="px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title} · {notes.length}
      </h2>
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => onOpen(note.id)}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/60",
            openId === note.id && "bg-muted",
          )}
        >
          <KindIcon kind={note.kind} className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{displayTitle(note)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {note.creatorId !== store.viewerId
                ? accountName(note.creatorId)
                : note.audience.length === 0
                  ? "Private"
                  : `${note.audience.length} people`}{" "}
              · {relativeTime(note.updatedAt)}
            </span>
          </span>
          {note.creatorId === store.viewerId && note.audience.length === 0 && (
            <LockIcon className="size-3.5 text-muted-foreground" />
          )}
        </button>
      ))}
      {notes.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">None yet.</p>}
    </div>
  )
}

function Editor({ note, store, onBack }: { note: Note; store: NotesStore; onBack: () => void }) {
  const mine = note.creatorId === store.viewerId
  return (
    <>
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <Button
          variant="ghost"
          size="icon-lg"
          className="md:hidden"
          aria-label="Back"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <span className="flex-1 px-2 text-xs text-muted-foreground">
          {mine ? "Yours" : `From ${accountName(note.creatorId)}`} · edited{" "}
          {relativeTime(note.updatedAt)}
        </span>
        <AudiencePopover note={note} store={store} />
        {mine && (
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Delete note"
            onClick={() => {
              store.remove(note.id)
              onBack()
            }}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto p-4 pb-24 md:p-8">
        <input
          value={note.title}
          onChange={(event) => store.setTitle(note.id, event.target.value)}
          placeholder="Title"
          className="bg-transparent text-3xl font-semibold outline-none placeholder:text-muted-foreground/60"
        />
        {note.kind === "text" ? (
          <textarea
            value={note.body}
            onChange={(event) => store.setBody(note.id, event.target.value)}
            placeholder="Start writing"
            className="flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
        ) : (
          <RowDragChecklist note={note} store={store} />
        )}
      </div>
    </>
  )
}

function AudiencePopover({ note, store }: { note: Note; store: NotesStore }) {
  const mine = note.creatorId === store.viewerId
  const others = ACCOUNTS.filter((account) => account.id !== store.viewerId)
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="lg" />}>
        {note.audience.length > 0 ? (
          <AvatarStack ids={mine ? note.audience : [note.creatorId, ...note.audience]} />
        ) : (
          <LockIcon />
        )}
        <span className="hidden sm:inline">{mine ? "Audience" : "Shared"}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        {mine ? (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 font-medium">
              <UsersIcon className="size-4" /> Who can see and edit
            </p>
            {others.map((account) => (
              <label key={account.id} className="flex items-center gap-3 py-1.5">
                <Checkbox
                  checked={note.audience.includes(account.id)}
                  onCheckedChange={(checked) =>
                    store.setAudience(
                      note.id,
                      checked
                        ? [...note.audience, account.id]
                        : note.audience.filter((a) => a !== account.id),
                    )
                  }
                />
                <Avatar id={account.id} />
                {account.name}
              </label>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              {note.audience.length === 0
                ? "Nobody else — this note is private."
                : "They can edit it too."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-medium">Shared by {accountName(note.creatorId)} with</p>
            <ul className="flex flex-col gap-1">
              {note.audience.map((id) => (
                <li key={id} className="flex items-center gap-2">
                  <Avatar id={id} /> {id === store.viewerId ? "You" : accountName(id)}
                </li>
              ))}
            </ul>
            <Button variant="outline" onClick={() => store.leave(note.id)}>
              Leave this note
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function RowDragChecklist({ note, store }: { note: Note; store: NotesStore }) {
  const { unchecked, checked } = orderedItems(note)
  const [dragId, setDragId] = useState<string>()
  const [draft, setDraft] = useState("")
  return (
    <div className="flex flex-col">
      {unchecked.map((item, index) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => setDragId(item.id)}
          onDragOver={(event) => {
            event.preventDefault()
            if (dragId && dragId !== item.id) store.moveItem(note.id, dragId, index)
          }}
          onDragEnd={() => setDragId(undefined)}
          className={cn(
            "flex items-center gap-3 border-b border-transparent py-1 hover:border-border",
            dragId === item.id && "opacity-50",
          )}
        >
          <Checkbox
            className="size-5"
            checked={false}
            onCheckedChange={() => store.toggleItem(note.id, item.id)}
          />
          <input
            value={item.text}
            onChange={(event) => store.setItemText(note.id, item.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.altKey && event.key === "ArrowUp") {
                event.preventDefault()
                store.moveItem(note.id, item.id, index - 1)
              }
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault()
                store.moveItem(note.id, item.id, index + 1)
              }
              if (event.key === "Backspace" && item.text === "") store.deleteItem(note.id, item.id)
            }}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none"
          />
        </div>
      ))}
      <form
        className="flex items-center gap-3 py-1"
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
          placeholder="Add item, press Enter"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground/60"
        />
      </form>
      {checked.length > 0 && (
        <div className="mt-4 flex flex-col">
          <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Done · {checked.length}
            <Button variant="link" size="sm" onClick={() => store.clearChecked(note.id)}>
              Clear
            </Button>
          </div>
          {checked.map((item) => (
            <label key={item.id} className="flex items-center gap-3 py-1.5 text-muted-foreground">
              <Checkbox
                className="size-5"
                checked
                onCheckedChange={() => store.toggleItem(note.id, item.id)}
              />
              <span className="line-through">{item.text}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
