// PROTOTYPE, throwaway. Variant B: a board of cards showing each Note's content, Items tickable
// right on the card; a Note opens in a dialog over the board. Items reorder with up/down
// buttons; checked Items stay visible, struck through. The Audience is a row of person chips at
// the foot of the dialog: the creator toggles them, everyone else sees them read-only.
import { cn } from "cn"
import { ArrowDownIcon, ArrowUpIcon, LogOutIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

export function VariantB({ store }: { store: NotesStore }) {
  const [openId, setOpenId] = useState<string>()
  const note = store.find(openId)
  const close = () => {
    if (note) store.discardIfEmpty(note.id)
    setOpenId(undefined)
  }
  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">Notes</h1>
      </div>
      {/* The quick-start bar: type straight into a Text note, or start a Checklist. */}
      <div className="mx-auto flex w-full max-w-xl items-center gap-1 rounded-xl border bg-card px-3 py-1 shadow-sm">
        <button
          type="button"
          className="flex-1 py-2.5 text-left text-muted-foreground"
          onClick={() => setOpenId(store.create("text"))}
        >
          Take a note…
        </button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="New checklist"
          onClick={() => setOpenId(store.create("checklist"))}
        >
          <KindIcon kind="checklist" />
        </Button>
      </div>
      <div className="columns-2 gap-3 sm:columns-3 xl:columns-4">
        {store.notes.map((shown) => (
          <Card key={shown.id} note={shown} store={store} onOpen={() => setOpenId(shown.id)} />
        ))}
      </div>
      <Dialog open={note !== undefined} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          {note && <Editor note={note} store={store} onClose={close} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Card({ note, store, onOpen }: { note: Note; store: NotesStore; onOpen: () => void }) {
  const mine = note.creatorId === store.viewerId
  const { unchecked, checked } = orderedItems(note)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
      className={cn(
        "mb-3 flex break-inside-avoid flex-col gap-2 rounded-xl border bg-card p-3 text-left shadow-xs hover:shadow-md",
        !mine && "border-l-4 border-l-sky-500",
      )}
    >
      {note.title && <span className="font-medium">{note.title}</span>}
      {note.kind === "text" ? (
        <p className="line-clamp-6 text-sm whitespace-pre-wrap text-muted-foreground">
          {note.body}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {unchecked.slice(0, 6).map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              {/* Ticking from the card doesn't open the Note. */}
              <span onClick={(event) => event.stopPropagation()} className="flex">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => store.toggleItem(note.id, item.id)}
                />
              </span>
              <span className="truncate">{item.text}</span>
            </li>
          ))}
          {unchecked.length > 6 && (
            <li className="text-xs text-muted-foreground">+{unchecked.length - 6} more</li>
          )}
          {checked.length > 0 && (
            <li className="text-xs text-muted-foreground">+ {checked.length} checked</li>
          )}
        </ul>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <KindIcon kind={note.kind} className="size-3.5" />
        <span className="flex-1">{relativeTime(note.updatedAt)}</span>
        {mine ? (
          <AvatarStack ids={note.audience} />
        ) : (
          <span className="flex items-center gap-1">
            from <Avatar id={note.creatorId} />
          </span>
        )}
      </div>
    </div>
  )
}

function Editor({ note, store, onClose }: { note: Note; store: NotesStore; onClose: () => void }) {
  const mine = note.creatorId === store.viewerId
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 p-4 pr-10">
        <DialogTitle className="sr-only">{displayTitle(note)}</DialogTitle>
        <input
          value={note.title}
          onChange={(event) => store.setTitle(note.id, event.target.value)}
          placeholder="Title"
          className="bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/60"
        />
        {note.kind === "text" ? (
          <textarea
            value={note.body}
            onChange={(event) => store.setBody(note.id, event.target.value)}
            placeholder="Take a note…"
            autoFocus
            rows={8}
            className="resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
          />
        ) : (
          <ArrowChecklist note={note} store={store} />
        )}
      </div>
      <div className="flex flex-col gap-2 border-t bg-muted/40 p-4">
        <span className="text-xs font-medium text-muted-foreground">
          {mine ? "Shared with (tap to change)" : `${accountName(note.creatorId)} shared this with`}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ACCOUNTS.filter((account) => account.id !== note.creatorId).map((account) => {
            const inAudience = note.audience.includes(account.id)
            if (!mine && !inAudience) return null
            return (
              <button
                key={account.id}
                type="button"
                disabled={!mine}
                onClick={() =>
                  store.setAudience(
                    note.id,
                    inAudience
                      ? note.audience.filter((a) => a !== account.id)
                      : [...note.audience, account.id],
                  )
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm",
                  inAudience
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-dashed text-muted-foreground",
                  !mine && "cursor-default",
                )}
              >
                <Avatar id={account.id} className="ring-0" />
                {account.id === store.viewerId ? "You" : account.name}
              </button>
            )
          })}
          {mine && note.audience.length === 0 && (
            <span className="self-center text-xs text-muted-foreground">Only you can see it.</span>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="flex-1 text-xs text-muted-foreground">
            Edited {relativeTime(note.updatedAt)}
          </span>
          {mine ? (
            <Button
              variant="destructive"
              onClick={() => {
                store.remove(note.id)
                onClose()
              }}
            >
              <Trash2Icon /> Delete
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                store.leave(note.id)
                onClose()
              }}
            >
              <LogOutIcon /> Leave
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}

function ArrowChecklist({ note, store }: { note: Note; store: NotesStore }) {
  const { unchecked, checked } = orderedItems(note)
  const [draft, setDraft] = useState("")
  return (
    <div className="flex flex-col gap-0.5">
      {unchecked.map((item, index) => (
        <div key={item.id} className="group flex items-center gap-2">
          <Checkbox
            className="size-5"
            checked={false}
            onCheckedChange={() => store.toggleItem(note.id, item.id)}
          />
          <input
            value={item.text}
            onChange={(event) => store.setItemText(note.id, item.id, event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none"
          />
          <span className="flex opacity-60 group-focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => store.moveItem(note.id, item.id, index - 1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move down"
              disabled={index === unchecked.length - 1}
              onClick={() => store.moveItem(note.id, item.id, index + 1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete item"
              onClick={() => store.deleteItem(note.id, item.id)}
            >
              <XIcon />
            </Button>
          </span>
        </div>
      ))}
      <form
        className="flex items-center gap-2"
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
          placeholder="List item"
          autoFocus
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground/60"
        />
      </form>
      {checked.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5 border-t pt-2">
          {checked.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <Checkbox
                className="size-5"
                checked
                onCheckedChange={() => store.toggleItem(note.id, item.id)}
              />
              <span className="flex-1 py-1.5 text-muted-foreground line-through">{item.text}</span>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => store.clearChecked(note.id)}
          >
            Clear {checked.length} checked
          </Button>
        </div>
      )}
    </div>
  )
}
