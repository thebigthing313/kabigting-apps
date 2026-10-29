import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  appendPosition,
  bottomOfUnchecked,
  checklistCounts,
  dropPosition,
  orderItems,
  positionBetween,
} from "./items.ts"

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

describe("bottomOfUnchecked", () => {
  test("goes after every unchecked Item, whatever the checked ones hold", () => {
    const next = bottomOfUnchecked([
      item("milk", { position: "c" }),
      item("eggs", { position: "s" }),
      item("jam", { position: "z", checkedAt: "2026-10-01T09:00:00.000Z" }),
    ])
    expect(next > "s").toBe(true)
    expect(next < "z").toBe(true)
  })

  test("starts in the middle when nothing is unchecked", () => {
    expect(bottomOfUnchecked([item("jam", { checkedAt: "2026-10-01T09:00:00.000Z" })])).toBe("i")
  })
})

describe("positionBetween", () => {
  test("a key strictly between two neighbours", () => {
    const between = positionBetween("c", "s")
    expect(between > "c" && between < "s").toBe(true)
  })

  test("at the top and at the bottom", () => {
    expect(positionBetween(null, "c") < "c").toBe(true)
    expect(positionBetween("s", null) > "s").toBe(true)
    expect(positionBetween(null, null)).toBe("i")
  })

  test("finds room between neighbours one digit apart, and under a key of zeros and a one", () => {
    for (const [before, after] of [
      ["a", "b"],
      ["az", "b"],
      ["a", "a1"],
      ["zz", null],
      [null, "001"],
      [null, "1"],
    ] as const) {
      const between = positionBetween(before, after)
      if (before !== null) expect(between > before).toBe(true)
      if (after !== null) expect(between < after).toBe(true)
      expect(between).toMatch(/^[0-9a-z]*[1-9a-z]$/)
    }
  })

  test("any two keys have room between them, and the key never ends in 0", () => {
    const key = fc.stringMatching(/^[0-9a-z]{0,6}[1-9a-z]$/)
    fc.assert(
      fc.property(fc.option(key), fc.option(key), (one, other) => {
        if (one !== null && one === other) return
        const [before, after] =
          one !== null && other !== null && one > other ? [other, one] : [one, other]
        const between = positionBetween(before, after)
        if (before !== null) expect(between > before).toBe(true)
        if (after !== null) expect(between < after).toBe(true)
        expect(between).toMatch(/^[0-9a-z]*[1-9a-z]$/)
      }),
    )
  })

  test("keeps keys short when Items keep going to the top", () => {
    let top = "i"
    for (let count = 0; count < 100; count += 1) top = positionBetween(null, top)
    expect(top.length).toBeLessThanOrEqual(25)
  })
})

describe("dropPosition", () => {
  const checklist = [
    item("milk", { position: "c" }),
    item("bread", { position: "i" }),
    item("eggs", { position: "s" }),
    item("jam", { position: "a", checkedAt: "2026-10-01T09:00:00.000Z" }),
  ]

  function afterDrop(id: string, toIndex: number) {
    const position = dropPosition(checklist, id, toIndex)
    if (position === null) return null
    const moved = checklist.map((each) => (each.id === id ? { ...each, position } : each))
    return ids(orderItems(moved).unchecked)
  }

  test("a drop between two Items goes between them", () => {
    expect(afterDrop("eggs", 1)).toEqual(["milk", "eggs", "bread"])
    expect(afterDrop("milk", 1)).toEqual(["bread", "milk", "eggs"])
  })

  test("a drop at the top goes before the first unchecked Item", () => {
    expect(afterDrop("eggs", 0)).toEqual(["eggs", "milk", "bread"])
  })

  test("a drop at the bottom goes after the last unchecked Item, whatever the checked ones hold", () => {
    expect(afterDrop("milk", 2)).toEqual(["bread", "eggs", "milk"])
  })

  test("a drop between two Items sharing a key goes after both, before the next", () => {
    const tied = [
      item("milk", { position: "c" }),
      item("bread", { position: "c" }),
      item("eggs", { position: "s" }),
      item("jam", { position: "x" }),
    ]
    const position = dropPosition(tied, "jam", 1)
    expect(position! > "c" && position! < "s").toBe(true)
  })

  test("a drop where the Item already is moves nothing", () => {
    expect(dropPosition(checklist, "bread", 1)).toBeNull()
  })

  test("a checked or missing Item can't be dropped", () => {
    expect(dropPosition(checklist, "jam", 0)).toBeNull()
    expect(dropPosition(checklist, "nothing", 0)).toBeNull()
  })
})

describe("checklistCounts", () => {
  test("counts the unchecked and the checked Items", () => {
    expect(
      checklistCounts([item("a"), item("b", { checkedAt: "2026-10-01T09:00:00.000Z" }), item("c")]),
    ).toEqual({ unchecked: 2, checked: 1 })
    expect(checklistCounts([])).toEqual({ unchecked: 0, checked: 0 })
  })
})
