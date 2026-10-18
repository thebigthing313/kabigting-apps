// The extract script and its example map agree with the fields the import reads. The script
// itself needs the Access ODBC driver and the private file, so only its text is checked here.
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { EXTRACT_FIELDS, EXTRACT_FILES } from "./extract.ts"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

const source = z.object({
  kind: z.string().optional(),
  table: z.string(),
  columns: z.record(z.string(), z.string()),
})
const example = z
  .record(z.string(), z.union([source, z.array(source)]))
  .parse(JSON.parse(read("scripts/finances-extract.map.example.json")))
const sorted = (values: readonly (string | undefined)[]) =>
  values.toSorted((a, b) => (a ?? "").localeCompare(b ?? ""))
const script = read("scripts/finances-extract.ps1")

describe("the extract map", () => {
  test("the example maps exactly the fields the import reads, per file", () => {
    expect(sorted(Object.keys(example))).toEqual(sorted(EXTRACT_FILES))
    for (const file of EXTRACT_FILES) {
      for (const entry of [example[file]].flat()) {
        expect(sorted(Object.keys(entry?.columns ?? {}))).toEqual(sorted(EXTRACT_FIELDS[file]))
      }
    }
  })

  test("schedules and transactions each come from an expense and an income table", () => {
    for (const file of ["schedules", "transactions"]) {
      const kinds = [example[file]].flat().map((entry) => entry?.kind)
      expect(sorted(kinds)).toEqual(["expense", "income"])
    }
  })

  test("the script names every field the import reads", () => {
    for (const file of EXTRACT_FILES) {
      for (const field of EXTRACT_FIELDS[file]) expect(script).toMatch(new RegExp(`\\b${field} =`))
    }
  })

  test("the script hard-codes no local path, and the real map stays out of git", () => {
    expect(script).not.toMatch(/[A-Za-z]:\\/)
    expect(script).toContain("ReadOnly=1")
    expect(read(".gitignore")).toMatch(/^scripts\/finances-extract\.map\.json$/m)
  })
})
