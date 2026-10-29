/**
 * The Checklist rules shared by the server and the client: how Items are ordered, where a new or
 * unticked Item goes, and the counts a Notes row shows.
 *
 * An Item's position is a sortable key: a string of base-36 digits compared character by
 * character, like a fraction after the point. Appending or moving rewrites only that Item, and a
 * key never ends in "0", so there is always room for another between two.
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

/**
 * A key between two others, like a midpoint: `null` for `before` is the top and for `after` the
 * bottom. The keys must differ, `before` first.
 */
export function positionBetween(before: string | null, after: string | null): string {
  return between(before ?? "", after)
}

const digitAt = (key: string, index: number) => DIGITS.indexOf(key.charAt(index) || "0")

function between(low: string, high: string | null): string {
  if (high !== null) {
    // Keep what the two share, reading a missing digit of the lower key as "0".
    let shared = 0
    while (shared < high.length && (low.charAt(shared) || "0") === high.charAt(shared)) shared += 1
    if (shared > 0) return high.slice(0, shared) + between(low.slice(shared), high.slice(shared))
  }
  const lowDigit = low === "" ? 0 : digitAt(low, 0)
  const highDigit = high === null ? DIGITS.length : digitAt(high, 0)
  if (highDigit - lowDigit > 1) return DIGITS.charAt(Math.round((lowDigit + highDigit) / 2))
  // Adjacent first digits: the higher key's first digit alone is between when more follows it;
  // otherwise keep the lower first digit and go after the rest of the lower key.
  if (high !== null && high.length > 1) return high.charAt(0)
  return DIGITS.charAt(lowDigit) + between(low.slice(1), null)
}

/**
 * The position that moves an unchecked Item to `toIndex` among the unchecked Items as shown, as
 * when it is dropped there: a key between its new neighbours, so only the moved Item changes.
 * Null when there is nothing to move: the Item is checked, missing, or already there.
 */
export function dropPosition(
  items: readonly ItemPlacing[],
  id: string,
  toIndex: number,
): string | null {
  const unchecked = orderItems(items).unchecked
  const from = unchecked.findIndex((item) => item.id === id)
  if (from === -1 || from === toIndex) return null
  const others = unchecked.filter((item) => item.id !== id)
  const index = Math.max(0, Math.min(toIndex, others.length))
  const before = others[index - 1]?.position ?? null
  // Neighbours can share a key, after two moves to the same gap at once. There is no room between
  // them, so the Item goes after the last of that key instead.
  const after =
    others.slice(index).find((item) => before === null || item.position > before)?.position ?? null
  return positionBetween(before, after)
}

/**
 * Where an Item goes to join the bottom of a Checklist's unchecked Items: when added, or when
 * unticked. Pass the Checklist's Items; checked ones are passed over.
 */
export function bottomOfUnchecked(
  items: readonly { checked: boolean; position: string }[],
): string {
  return appendPosition(items.filter((item) => !item.checked).map((item) => item.position))
}

/** How many of a Checklist's Items are unchecked and checked, for "N to do · N done". */
export function checklistCounts(items: readonly { checked: boolean }[]): {
  unchecked: number
  checked: number
} {
  const checked = items.filter((item) => item.checked).length
  return { unchecked: items.length - checked, checked }
}
