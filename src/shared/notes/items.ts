/**
 * The Checklist rules shared by the server and the client: how Items are ordered, where a new or
 * unticked Item goes, and the counts a Notes row shows.
 *
 * An Item's position is a sortable key: a string of base-36 digits compared character by
 * character, like a fraction after the point. Appending rewrites only the appended Item, and a key
 * never ends in "0", so there is always room for another between two.
 */

/** The parts of an Item that decide where it sits. */
export type ItemPlacing = {
  id: string
  position: string
  checked: boolean
  /** Server time of the tick; null while unchecked. */
  checkedAt: string | null
}

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"
const LAST_DIGIT = DIGITS.at(-1)
/** Where the first Item of a Checklist goes: the middle, leaving room on both sides. */
const FIRST_POSITION = "i"

function byPosition(a: ItemPlacing, b: ItemPlacing): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function byNewestCheck(a: ItemPlacing, b: ItemPlacing): number {
  return Date.parse(b.checkedAt ?? "") - Date.parse(a.checkedAt ?? "") || byPosition(a, b)
}

/**
 * A Checklist's Items as shown: unchecked by position, then checked with the most recently
 * checked first. Ties go to the older id. Returns new arrays.
 */
export function orderItems<Item extends ItemPlacing>(
  items: readonly Item[],
): { unchecked: Item[]; checked: Item[] } {
  return {
    unchecked: items.filter((item) => !item.checked).toSorted(byPosition),
    checked: items.filter((item) => item.checked).toSorted(byNewestCheck),
  }
}

/**
 * A position after every one given: for an Item added, or unticked, to the bottom of the
 * unchecked Items. Pass the unchecked Items' positions.
 */
export function appendPosition(positions: readonly string[]): string {
  const last = positions.reduce<string | null>(
    (max, position) => (max === null || position > max ? position : max),
    null,
  )
  if (last === null) return FIRST_POSITION
  // Raise the first digit that can go up, dropping what follows; past "zz…z", add a digit.
  let index = 0
  while (index < last.length && last.charAt(index) === LAST_DIGIT) index += 1
  if (index === last.length) return `${last}1`
  return last.slice(0, index) + DIGITS.charAt(DIGITS.indexOf(last.charAt(index)) + 1)
}

/** What a Checklist row counts: "N to do · N done". */
export function checklistCounts(items: readonly { checked: boolean }[]): {
  toDo: number
  done: number
} {
  const done = items.filter((item) => item.checked).length
  return { toDo: items.length - done, done }
}
