import { PencilIcon, PlusIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { NameDialog } from "@/components/name-dialog"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import type { InlineAdd } from "@/data/inline-adds"

export type PickerOption = { id: string; name: string; archived: boolean }

/** A row in the list: an existing entry, or the offer to add what was typed. */
type Item = { id: string; name: string; adding: boolean }

export type NamePickerProps = {
  /** The input's id, for the form's label. */
  id?: string
  /** What is picked, such as "Account" or "Category". */
  noun: string
  options: readonly PickerOption[]
  /** The picked entry's id, or null for none. */
  value: string | null
  onValueChange: (id: string | null) => void
  /** Creates an entry with this name: its id at once, and whether the server stored it. */
  onAdd: (name: string) => InlineAdd
  onRename: (id: string, name: string) => void
}

function sameName(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

/**
 * Picks an Account or Category by name. Archived entries are hidden. Typing a new name offers
 * "Add" inline, and the picked entry can be renamed from a small dialog.
 */
export function NamePicker({
  id,
  noun,
  options,
  value,
  onValueChange,
  onAdd,
  onRename,
}: NamePickerProps) {
  const [query, setQuery] = useState("")
  const [renaming, setRenaming] = useState(false)
  // What is picked now, for an add the server refuses after the pick has moved on.
  const pickedNow = useRef(value)
  useEffect(() => {
    pickedNow.current = value
  })

  const picked = options.find((option) => option.id === value) ?? null
  const selected: Item | null = picked ? { id: picked.id, name: picked.name, adding: false } : null
  const shown: Item[] = options
    .filter((option) => !option.archived || option.id === value)
    .map((option) => ({ id: option.id, name: option.name, adding: false }))
  const typed = query.trim()
  // An archived entry still owns its name, so it is not offered as new.
  const canAdd = typed !== "" && !options.some((option) => sameName(option.name, typed))
  const items = canAdd ? [...shown, { id: "", name: typed, adding: true }] : shown

  return (
    <div className="flex items-center gap-2">
      <Combobox<Item>
        items={items}
        value={selected}
        onValueChange={(item) => {
          if (item?.adding) {
            const { id: added, saved } = onAdd(item.name)
            onValueChange(added)
            // A refused add is rolled back; clear it, unless something else was picked since.
            void saved.then((ok) => {
              if (!ok && pickedNow.current === added) onValueChange(null)
            })
          } else onValueChange(item?.id ?? null)
        }}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => item.name}
        isItemEqualToValue={(a, b) => a.id === b.id}
      >
        <ComboboxInput
          id={id}
          className="h-11 flex-1"
          placeholder="Pick or type a name"
          autoComplete="off"
          showClear
        />
        <ComboboxContent>
          <ComboboxEmpty>No matches</ComboboxEmpty>
          <ComboboxList>
            {(item: Item) =>
              item.adding ? (
                <ComboboxItem key="add" value={item}>
                  <PlusIcon />
                  {`Add "${item.name}"`}
                </ComboboxItem>
              ) : (
                <ComboboxItem key={item.id} value={item}>
                  {item.name}
                </ComboboxItem>
              )
            }
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {picked ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-11"
          aria-label={`Rename ${noun}`}
          onClick={() => setRenaming(true)}
        >
          <PencilIcon />
        </Button>
      ) : null}
      {picked ? (
        <NameDialog
          open={renaming}
          onOpenChange={setRenaming}
          title={`Rename ${noun}`}
          initialName={picked.name}
          takenNames={options.map((option) => option.name)}
          onSave={(name) => {
            onRename(picked.id, name)
            setRenaming(false)
          }}
        />
      ) : null}
    </div>
  )
}
