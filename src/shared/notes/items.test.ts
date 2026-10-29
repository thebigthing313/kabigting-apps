import { describe, expect, test } from "vitest"
import { appendPosition, checklistCounts, orderItems } from "./items.ts"

function item(id: string, overrides: { position?: string; checkedAt?: string | null } = {}) {
  const checkedAt = overrides.checkedAt ?? null
  return { id, position: overrides.position ?? "i", checked: checkedAt !== null, checkedAt }
}

const ids = (items: readonly { id: string }[]) => items.map((each) => each.id)

describe("orderItems", () => {
  test("unchecked Items follow their positions", () => {
    const { unchecked, checked } = orderItems([
      item("eggs", { position: "s" }),
      item("milk", { position: "c" }),
      item("bread", { position: "i" }),
    ])
    expect(ids(unchecked)).toEqual(["milk", "bread", "eggs"])
    expect(checked).toEqual([])
  })

  test("positions compare character by character, so a longer key can sort first", () => {
    const { unchecked } = orderItems([
      item("later", { position: "z" }),
      item("between", { position: "yzi" }),
      item("first", { position: "y" }),
    ])
    expect(ids(unchecked)).toEqual(["first", "between", "later"])
  })

  test("checked Items come apart, the most recently checked first", () => {
    const { unchecked, checked } = orderItems([
      item("milk", { checkedAt: "2026-10-01T09:00:00.000Z" }),
      item("eggs"),
      item("bread", { checkedAt: "2026-10-01T09:05:00.000Z" }),
      item("jam", { checkedAt: "2026-10-01T09:00:00.500Z", position: "a" }),
    ])
    expect(ids(unchecked)).toEqual(["eggs"])
    expect(ids(checked)).toEqual(["bread", "jam", "milk"])
  })

  test("a tie goes to the older id, and the input is left alone", () => {
    const items = [
      item("0190a000-0000-7000-8000-000000000002"),
      item("0190a000-0000-7000-8000-000000000001"),
    ]
    expect(ids(orderItems(items).unchecked).map((id) => id.slice(-1))).toEqual(["1", "2"])
    expect(items[0]!.id.slice(-1)).toBe("2")
  })
})

describe("appendPosition", () => {
  test("an empty Checklist starts in the middle", () => {
    expect(appendPosition([])).toBe("i")
  })

  test("sorts after every position given", () => {
    for (const positions of [["i"], ["c", "s", "i"], ["y"], ["z"], ["zz"], ["zi", "z"], ["a0b"]]) {
      const next = appendPosition(positions)
      for (const position of positions) expect(next > position).toBe(true)
    }
  })

  test("stays short over many appends", () => {
    const positions: string[] = []
    for (let count = 0; count < 500; count += 1) positions.push(appendPosition(positions))
    expect(new Set(positions).size).toBe(500)
    expect(positions.toSorted()).toEqual(positions)
    expect(Math.max(...positions.map((position) => position.length))).toBeLessThanOrEqual(20)
  })
})

describe("checklistCounts", () => {
  test("counts what is left to do and what is done", () => {
    expect(
      checklistCounts([item("a"), item("b", { checkedAt: "2026-10-01T09:00:00.000Z" }), item("c")]),
    ).toEqual({ toDo: 2, done: 1 })
    expect(checklistCounts([])).toEqual({ toDo: 0, done: 0 })
  })
})
