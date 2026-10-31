// The mapping of Splitwise user to Account email: the committed example holds only made-up
// values, the real file stays out of git, and a bad entry is named by number, never by value.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { EXAMPLE_MAP_FILE, MAP_FILE, MappingInvalid, parseMapping } from "./mapping.ts"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe("the mapping file", () => {
  test("the committed example maps made-up ids to @example.com emails only", () => {
    const entries = parseMapping(JSON.parse(read(EXAMPLE_MAP_FILE)))
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) expect(entry.email).toMatch(/@example\.com$/)
    expect(entries.map((entry) => entry.number)).toEqual(entries.map((_, index) => index + 1))
  })

  test("the real mapping is git-ignored", () => {
    expect(read(".gitignore")).toMatch(/^scripts\/split-import\.map\.json$/m)
    const ignored = execFileSync("git", ["check-ignore", MAP_FILE], {
      cwd: fileURLToPath(root),
      encoding: "utf8",
    })
    expect(ignored.trim()).toBe(MAP_FILE)
  })

  test("entries are numbered in order, emails compared in lower case", () => {
    expect(parseMapping({ "11": "One@Example.com", "12": " two@example.com " })).toEqual([
      { number: 1, splitwiseId: "11", email: "one@example.com" },
      { number: 2, splitwiseId: "12", email: "two@example.com" },
    ])
  })

  test.each([
    [[], "one object of Splitwise user id to email"],
    [{}, "maps nobody"],
    [
      { "11": "one@example.com", abc: "two@example.com" },
      "Mapping entry 2: the Splitwise user id is not a number",
    ],
    [{ "11": "not-an-email" }, "Mapping entry 1: the email is not an email address"],
    [{ "11": 42 }, "Mapping entry 1: the email is not an email address"],
  ])("refuses %j without echoing its values", (file, message) => {
    const thrown = thrownBy(() => parseMapping(file))
    expect(thrown).toBeInstanceOf(MappingInvalid)
    expect(String(thrown)).toContain(message)
    expect(String(thrown)).not.toContain("not-an-email")
    expect(String(thrown)).not.toContain("example.com")
  })
})
