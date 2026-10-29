import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { cn } from "cn"
import { ChevronDownIcon, GripVerticalIcon, PlusIcon, XIcon } from "lucide-react"
import { useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react"
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
  /** An unchecked Item was dropped at `toIndex` among the unchecked Items. */
  onMoveItem: (id: string, toIndex: number) => void
  autoFocusAdd?: boolean
}

/** The space a row's drag handle takes, kept empty where there is none so rows line up. */
const HANDLE_SLOT = "flex h-11 w-8 shrink-0 items-center justify-center"

function EditableItem({
  item,
  onEnter,
  onChangeItem,
  onToggleItem,
  onDeleteItem,
  onLeaveItem,
  handle,
  rowRef,
  style,
  dragging = false,
}: ItemHandlers & {
  item: DraftItem
  onEnter: () => void
  /** The drag handle, for an unchecked Item. */
  handle?: ReactNode
  rowRef?: Ref<HTMLLIElement>
  style?: CSSProperties
  dragging?: boolean
}) {
  return (
    <li
      ref={rowRef}
      style={style}
      className={cn(
        "group flex min-h-11 items-center gap-2 rounded-md bg-background",
        dragging && "relative z-10 bg-muted shadow-sm",
      )}
    >
      {handle ?? <span aria-hidden className={HANDLE_SLOT} />}
      <Checkbox
        checked={item.checked}
        onCheckedChange={(checked) => onToggleItem(item.id, checked)}
        aria-label={item.text.trim() || "Item"}
        className="size-5"
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
          "ml-1 min-w-0 flex-1 bg-transparent py-2 text-base outline-none",
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

/** An unchecked Item, dragged by its handle with a mouse, a finger or the keyboard. */
function SortableItem(props: ItemHandlers & { item: DraftItem; onEnter: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id })
  return (
    <EditableItem
      {...props}
      rowRef={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      dragging={isDragging}
      handle={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${props.item.text.trim() || "item"}`}
          // No scrolling from the handle, so a finger on it drags the Item instead.
          className={cn(HANDLE_SLOT, "cursor-grab touch-none rounded-md text-muted-foreground")}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      }
    />
  )
}

/** Items move up and down only. */
const alongTheColumn: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/**
 * The unchecked Items in order, each with a drag handle that works with a mouse, on touch and
 * with the keyboard (space or enter to pick up, the arrow keys to move, space or enter to drop).
 */
function UncheckedItems({
  items,
  onMoveItem,
  onEnter,
  ...handlers
}: ItemHandlers & {
  items: readonly DraftItem[]
  onMoveItem: (id: string, toIndex: number) => void
  onEnter: () => void
}) {
  const sensors = useSensors(
    // A few pixels of travel first, so a tap on the handle is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const indexOf = (id: UniqueIdentifier) => items.findIndex((item) => item.id === id)
  const name = (id: UniqueIdentifier) => items[indexOf(id)]?.text.trim() || "item"
  const place = (id: UniqueIdentifier) => `position ${indexOf(id) + 1} of ${items.length}`
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, at ${place(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} moved to ${place(over.id)}.` : `${name(active.id)} is outside.`,
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} dropped at ${place(over.id)}.` : `${name(active.id)} put back.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} cancelled; it is back in place.`,
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[alongTheColumn]}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move an item, press space or enter. Move it with the arrow keys, then press space or enter to drop it, or escape to cancel.",
        },
      }}
      onDragEnd={({ active, over }) => {
        const toIndex = over ? indexOf(over.id) : -1
        if (toIndex !== -1) onMoveItem(String(active.id), toIndex)
      }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label="To do" className="flex flex-col">
          {items.map((item) => (
            <SortableItem key={item.id} item={item} onEnter={onEnter} {...handlers} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

/**
 * A Checklist's Items: the unchecked ones in order, each with a drag handle, and an "Add item"
 * row under them, then the checked ones, struck through and not draggable, folded under a
 * collapsible "N checked" section.
 */
export function ChecklistItems({
  items,
  newItemText,
  onTypeNewItem,
  onAddItem,
  onMoveItem,
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
        <UncheckedItems
          items={unchecked}
          onMoveItem={onMoveItem}
          onEnter={focusAddRow}
          {...handlers}
        />
      )}
      <div className="flex min-h-11 items-center gap-2">
        <span aria-hidden className={HANDLE_SLOT} />
        <PlusIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
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
          className="ml-1 min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground/60"
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
