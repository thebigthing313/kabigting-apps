import { cn } from "cn"
import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react"
import { useRef, useState } from "react"
import type { DraftItem } from "@/apps/notes/use-note-draft"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { orderItems } from "@shared/notes/items"

type ItemHandlers = {
  onChangeItem: (id: string, text: string) => void
  onToggleItem: (id: string, checked: boolean) => void
  onDeleteItem: (id: string) => void
  /** The Item lost focus: a blank one is dropped. */
  onLeaveItem: (id: string) => void
}

export type ChecklistItemsProps = ItemHandlers & {
  items: readonly DraftItem[]
  /** What is typed in the "Add item" row. */
  newItemText: string
  onTypeNewItem: (text: string) => void
  /** Adds what is typed in the "Add item" row. */
  onAddItem: () => void
  autoFocusAdd?: boolean
}

function EditableItem({
  item,
  onEnter,
  onChangeItem,
  onToggleItem,
  onDeleteItem,
  onLeaveItem,
}: ItemHandlers & { item: DraftItem; onEnter: () => void }) {
  return (
    <li className="group flex min-h-11 items-center gap-3">
      <Checkbox
        checked={item.checked}
        onCheckedChange={(checked) => onToggleItem(item.id, checked)}
        aria-label={item.text.trim() || "Item"}
        className="ml-1 size-5"
      />
      <input
        aria-label="Item"
        value={item.text}
        onChange={(event) => onChangeItem(item.id, event.target.value)}
        onBlur={() => onLeaveItem(item.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onEnter()
          }
        }}
        maxLength={1_000}
        className={cn(
          "min-w-0 flex-1 bg-transparent py-2 text-base outline-none",
          item.checked && "text-muted-foreground line-through",
        )}
      />
      {/* Always there on touch; on a desktop it shows on hover or focus. */}
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="Delete item"
        onClick={() => onDeleteItem(item.id)}
        className="text-muted-foreground pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
      >
        <XIcon />
      </Button>
    </li>
  )
}

/**
 * A Checklist's Items: the unchecked ones in order with an "Add item" row under them, then the
 * checked ones, struck through, folded under a collapsible "N checked" section.
 */
export function ChecklistItems({
  items,
  newItemText,
  onTypeNewItem,
  onAddItem,
  autoFocusAdd = false,
  ...handlers
}: ChecklistItemsProps) {
  const { unchecked, checked } = orderItems(items)
  const [showChecked, setShowChecked] = useState(true)
  const addRow = useRef<HTMLInputElement>(null)
  const focusAddRow = () => addRow.current?.focus()

  return (
    <div className="flex flex-col">
      {unchecked.length > 0 && (
        <ul aria-label="To do" className="flex flex-col">
          {unchecked.map((item) => (
            <EditableItem key={item.id} item={item} onEnter={focusAddRow} {...handlers} />
          ))}
        </ul>
      )}
      <div className="flex min-h-11 items-center gap-3">
        <PlusIcon aria-hidden className="ml-0.5 size-5 shrink-0 text-muted-foreground" />
        <input
          ref={addRow}
          aria-label="Add item"
          placeholder="Add item"
          value={newItemText}
          onChange={(event) => onTypeNewItem(event.target.value)}
          onBlur={onAddItem}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onAddItem()
            }
          }}
          autoFocus={autoFocusAdd}
          maxLength={1_000}
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {checked.length > 0 && (
        <section className="mt-2 flex flex-col border-t pt-1">
          <button
            type="button"
            aria-expanded={showChecked}
            onClick={() => setShowChecked((shown) => !shown)}
            className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
          >
            <ChevronDownIcon className={cn("size-4 transition", !showChecked && "-rotate-90")} />
            {checked.length} checked
          </button>
          {showChecked && (
            <ul aria-label="Checked" className="flex flex-col">
              {checked.map((item) => (
                <EditableItem key={item.id} item={item} onEnter={focusAddRow} {...handlers} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
