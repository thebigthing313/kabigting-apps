// The Splitwise snapshot, against a stubbed `fetch`. Every id, name and amount here is made up.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { z } from "zod"
import {
  DEFAULT_OUT_DIR,
  FetchFailed,
  fetchExpensePages,
  PAGE_SIZE,
  runFetch,
  SNAPSHOT_FILE,
} from "./fetch.ts"

const GROUP_ID = "4242"
const API_KEY = "made-up-key"

type Call = { path: string; params: URLSearchParams; authorization: string | null }
type FakeOptions = {
  /** Refuse every call with this status. */
  status?: number
  /** Refuse only the `get_expenses` page at this offset. */
  refuseOffset?: number
}

const refused = (status: number) =>
  Promise.resolve(Response.json({ errors: { base: ["refused"] } }, { status }))

/** A fake Splitwise API holding `rowCount` made-up expenses in one group. */
function fakeSplitwise(rowCount: number, options: FakeOptions = {}) {
  const calls: Call[] = []
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    id: 1000 + index,
    cost: "1.00",
    description: `Made-up expense ${index}`,
  }))
  const stub: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const authorization = new Headers(init?.headers).get("authorization")
    calls.push({ path: url.pathname, params: url.searchParams, authorization })
    if (options.status !== undefined) return refused(options.status)
    if (url.pathname.endsWith(`/get_group/${GROUP_ID}`)) {
      return Promise.resolve(Response.json({ group: { id: Number(GROUP_ID), name: "Made up" } }))
    }
    if (url.pathname.endsWith("/get_expenses")) {
      const offset = Number(url.searchParams.get("offset"))
      const limit = Number(url.searchParams.get("limit"))
      if (offset === options.refuseOffset) return refused(500)
      return Promise.resolve(Response.json({ expenses: rows.slice(offset, offset + limit) }))
    }
    return refused(404)
  }
  return { stub, calls }
}

const page = z.object({ expenses: z.array(z.object({ id: z.number() })) })
const snapshotFile = z.object({
  groupId: z.string(),
  fetchedAt: z.string(),
  group: z.unknown(),
  expensePages: z.array(z.unknown()),
})
const expenseIds = (pages: readonly unknown[]) =>
  pages.flatMap((body) => page.parse(body).expenses.map((row) => row.id))
const offsets = (calls: readonly Call[]) => calls.map((call) => call.params.get("offset"))

const pageWithoutList: typeof fetch = () => Promise.resolve(Response.json({ something: "else" }))
const unreachable: typeof fetch = () => Promise.reject(new TypeError("fetch failed"))
const readRepoFile = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")

describe("fetchExpensePages", () => {
  test("pages at 100 with an offset and stops on a short last page", async () => {
    const { stub, calls } = fakeSplitwise(250)
    const pages = await fetchExpensePages(stub, API_KEY, GROUP_ID)

    expect(PAGE_SIZE).toBe(100)
    expect(pages).toHaveLength(3)
    expect(new Set(expenseIds(pages)).size).toBe(250)
    expect(offsets(calls)).toEqual(["0", "100", "200"])
    for (const call of calls) {
      expect(call.path).toMatch(/\/get_expenses$/)
      expect(call.params.get("group_id")).toBe(GROUP_ID)
      expect(call.params.get("limit")).toBe("100")
      expect(call.authorization).toBe(`Bearer ${API_KEY}`)
    }
  })

  test("asks once more after a full last page and stops on the empty one", async () => {
    const { stub, calls } = fakeSplitwise(200)
    const pages = await fetchExpensePages(stub, API_KEY, GROUP_ID)

    expect(offsets(calls)).toEqual(["0", "100", "200"])
    expect(expenseIds(pages)).toHaveLength(200)
  })

  test("an empty group takes one call", async () => {
    const { stub, calls } = fakeSplitwise(0)
    const pages = await fetchExpensePages(stub, API_KEY, GROUP_ID)

    expect(calls).toHaveLength(1)
    expect(expenseIds(pages)).toEqual([])
  })

  test("a page without an expenses list fails", async () => {
    await expect(fetchExpensePages(pageWithoutList, API_KEY, GROUP_ID)).rejects.toThrow(FetchFailed)
  })
})

describe("runFetch", () => {
  let root: string
  let outDir: string
  const lines: string[] = []
  const print = (line: string) => lines.push(line)

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "split-fetch-"))
    outDir = join(root, "exports")
    lines.length = 0
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const written = () => readdir(outDir).catch(() => [])

  test("writes one file holding every expense page and the group", async () => {
    const { stub } = fakeSplitwise(150)
    const now = new Date(Date.UTC(2026, 0, 2, 3, 4, 5))
    await runFetch([GROUP_ID], { fetch: stub, apiKey: API_KEY, outDir, now }, print)

    expect(await written()).toEqual([SNAPSHOT_FILE])
    const text = await readFile(join(outDir, SNAPSHOT_FILE), "utf8")
    const snapshot = snapshotFile.parse(JSON.parse(text))
    expect(snapshot.groupId).toBe(GROUP_ID)
    expect(snapshot.fetchedAt).toBe("2026-01-02T03:04:05.000Z")
    expect(snapshot.group).toEqual({ group: { id: 4242, name: "Made up" } })
    expect(snapshot.expensePages).toHaveLength(2)
    expect(expenseIds(snapshot.expensePages)).toHaveLength(150)
    expect(lines.join("\n")).toContain("150 expense rows")
  })

  test("a missing key fails before any call and writes nothing", async () => {
    const { stub, calls } = fakeSplitwise(10)
    await expect(
      runFetch([GROUP_ID], { fetch: stub, apiKey: undefined, outDir }, print),
    ).rejects.toThrow(/SPLITWISE_API_KEY/)
    expect(calls).toHaveLength(0)
    expect(await written()).toEqual([])
  })

  test("an API refusal fails with its status and writes nothing", async () => {
    const { stub } = fakeSplitwise(10, { status: 401 })
    await expect(
      runFetch([GROUP_ID], { fetch: stub, apiKey: API_KEY, outDir }, print),
    ).rejects.toThrow(/401/)
    expect(await written()).toEqual([])
  })

  test("a refusal partway through the pages writes nothing", async () => {
    const { stub } = fakeSplitwise(250, { refuseOffset: 200 })
    await expect(
      runFetch([GROUP_ID], { fetch: stub, apiKey: API_KEY, outDir }, print),
    ).rejects.toThrow(/500/)
    expect(await written()).toEqual([])
  })

  test("a network failure fails and writes nothing", async () => {
    await expect(
      runFetch([GROUP_ID], { fetch: unreachable, apiKey: API_KEY, outDir }, print),
    ).rejects.toThrow(FetchFailed)
    expect(await written()).toEqual([])
  })

  test.each([[[]], [["abc"]], [[GROUP_ID, "extra"]]])(
    "refuses a missing or malformed group id: %j",
    async (args) => {
      const { stub, calls } = fakeSplitwise(10)
      await expect(runFetch(args, { fetch: stub, apiKey: API_KEY, outDir }, print)).rejects.toThrow(
        /Usage/,
      )
      expect(calls).toHaveLength(0)
    },
  )
})

describe("the snapshot's place in the repository", () => {
  test("the exports directory is git-ignored and the example env names the key", async () => {
    expect(DEFAULT_OUT_DIR).toBe("exports")
    expect(await readRepoFile(".gitignore")).toMatch(/^exports\/$/m)
    expect(await readRepoFile(".env.example")).toMatch(/^SPLITWISE_API_KEY=$/m)
  })
})
