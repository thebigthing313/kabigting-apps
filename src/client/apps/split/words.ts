// How Split puts Balances and shares into words. The viewer is always "You", and comes first.
import { formatInstantMonthDay } from "@shared/dates"
import { format } from "@shared/money"
import type { Shares } from "@shared/split/schemas"

/** Where in a sentence a name goes: the viewer is "You" at its start and "you" within it. */
export type Place = "start" | "within"

/** Names the people Split shows: "You" for the viewer, otherwise their name. */
export type People = {
  viewerId: string
  /** Everyone's ids, oldest Account first. */
  order: readonly string[]
  nameOf: (id: string, place?: Place) => string
}

/** Builds `People` from the Members, oldest Account first. */
export function people(viewerId: string, members: readonly { id: string; name: string }[]): People {
  const names = new Map(members.map((member) => [member.id, member.name]))
  return {
    viewerId,
    order: members.map((member) => member.id),
    nameOf: (id, place = "start") => {
      if (id === viewerId) return place === "start" ? "You" : "you"
      return names.get(id) ?? "Someone"
    },
  }
}

/** The viewer's own Balance in words. */
export function viewerBalanceWords(cents: number): string {
  if (cents === 0) return "You're settled up"
  return cents > 0 ? "The others owe you" : "You owe the others"
}

/** Another Member's Balance in words: "Ana is owed $12.00", "Ben owes $5.00". */
export function memberBalanceWords(name: string, cents: number): string {
  if (cents === 0) return `${name} is settled up`
  return cents > 0 ? `${name} is owed ${format(cents)}` : `${name} owes ${format(-cents)}`
}

/** "A", "A and B", "A, B and C". */
function list(names: readonly string[]): string {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

/** The viewer first, then everyone else oldest Account first; anyone unknown last. */
function inOrder(ids: readonly string[], { viewerId, order }: People): string[] {
  const rank = (id: string) => (id === viewerId ? -1 : order.includes(id) ? order.indexOf(id) : 1e9)
  return ids.toSorted((a, b) => rank(a) - rank(b))
}

/**
 * One side of an Expense in words, those with the same share together: "You paid $54.00",
 * "You, Ana and Ben owe $18.00 each", "Ana owes $3.34; you and Ben owe $3.33 each".
 */
export function sideWords(shares: Shares, verb: "paid" | "owe", who: People): string {
  const groups = new Map<number, string[]>()
  for (const id of inOrder(Object.keys(shares), who)) {
    const cents = shares[id] ?? 0
    groups.set(cents, [...(groups.get(cents) ?? []), id])
  }
  if (groups.size === 0) return "Nobody"
  const phrases = [...groups].map(([cents, ids], index) => {
    const names = ids.map((id, at) => who.nameOf(id, index === 0 && at === 0 ? "start" : "within"))
    const single = ids.length === 1
    const word = verb === "paid" ? "paid" : single && ids[0] !== who.viewerId ? "owes" : "owe"
    return `${list(names)} ${word} ${format(cents)}${single ? "" : " each"}`
  })
  return phrases.join("; ")
}

/** Who added an entry and when, and who changed it last and when. */
export type Authorship = { addedBy: string; addedAt: string; changedBy: string; changedAt: string }

/**
 * Who added an entry and who changed it, by day in the household zone: "Added by Ana on Oct 3",
 * then " · changed by you on Oct 5" once it has been changed.
 */
export function authorshipWords(entry: Authorship, who: People): string {
  const added = `Added by ${who.nameOf(entry.addedBy, "within")} on ${formatInstantMonthDay(entry.addedAt)}`
  if (entry.changedAt === entry.addedAt) return added
  const by = who.nameOf(entry.changedBy, "within")
  return `${added} · changed by ${by} on ${formatInstantMonthDay(entry.changedAt)}`
}
