// The one-time snapshot of the household's Splitwise group, the only input to the Split import:
//   pnpm split:fetch <group id>
// It reads SPLITWISE_API_KEY from .env, sends it as a Bearer token, reads `get_group` and every
// page of `get_expenses`, then writes the raw responses to one file in the git-ignored exports
// directory. Any failure exits non-zero and writes nothing. It prints only counts.
import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const SPLITWISE_API = "https://secure.splitwise.com/api/v3.0"
/** Splitwise caps `limit` silently and `limit=0` is undocumented, so page at a fixed size. */
export const PAGE_SIZE = 100
/** A guard against an API that ignores `offset`: far beyond any household's history. */
const MAX_PAGES = 1_000
export const SNAPSHOT_FILE = "splitwise-snapshot.json"
export const DEFAULT_OUT_DIR = "exports"

const USAGE = "Usage: pnpm split:fetch <group id>"

export class FetchFailed extends Error {}

/** The file the import reads: the raw API responses, untouched. */
export type Snapshot = {
  groupId: string
  fetchedAt: string
  /** The `get_group/<group id>` response body. */
  group: unknown
  /** Each `get_expenses` response body, in offset order. */
  expensePages: unknown[]
}

async function getJson(fetchFn: typeof fetch, apiKey: string, url: URL): Promise<unknown> {
  let response: Response
  try {
    response = await fetchFn(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    })
  } catch {
    throw new FetchFailed(`Could not reach Splitwise for ${url.pathname}`)
  }
  if (!response.ok) {
    throw new FetchFailed(`Splitwise refused ${url.pathname} with HTTP ${response.status}`)
  }
  try {
    const body: unknown = await response.json()
    return body
  } catch {
    throw new FetchFailed(`Splitwise sent ${url.pathname} a body that is not JSON`)
  }
}

/** The rows of one `get_expenses` page, or undefined when it holds no list. */
export function expenseRows(page: unknown): readonly unknown[] | undefined {
  if (typeof page !== "object" || page === null || !("expenses" in page)) return undefined
  const rows: unknown = page.expenses
  return Array.isArray(rows) ? rows : undefined
}

/** Every page of `get_expenses` for the group, stopping on the first short page. */
export async function fetchExpensePages(
  fetchFn: typeof fetch,
  apiKey: string,
  groupId: string,
): Promise<unknown[]> {
  const pages: unknown[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${SPLITWISE_API}/get_expenses`)
    url.searchParams.set("group_id", groupId)
    url.searchParams.set("limit", String(PAGE_SIZE))
    url.searchParams.set("offset", String(page * PAGE_SIZE))
    const body = await getJson(fetchFn, apiKey, url)
    const rows = expenseRows(body)
    if (rows === undefined) {
      throw new FetchFailed(`get_expenses page ${page + 1} has no expenses list`)
    }
    pages.push(body)
    if (rows.length < PAGE_SIZE) return pages
  }
  throw new FetchFailed(`get_expenses did not end within ${MAX_PAGES} pages`)
}

async function fetchGroup(fetchFn: typeof fetch, apiKey: string, groupId: string) {
  const body = await getJson(fetchFn, apiKey, new URL(`${SPLITWISE_API}/get_group/${groupId}`))
  const group: unknown =
    typeof body === "object" && body !== null && "group" in body ? body.group : null
  if (typeof group !== "object" || group === null) {
    throw new FetchFailed("get_group returned no group")
  }
  return body
}

export type FetchDeps = {
  fetch: typeof fetch
  apiKey: string | undefined
  /** Where the snapshot goes; the git-ignored exports directory by default. */
  outDir?: string
  now?: Date
}

export async function runFetch(
  args: readonly string[],
  deps: FetchDeps,
  print: (line: string) => void,
): Promise<void> {
  const [groupId, ...extra] = args
  if (groupId === undefined || !/^\d+$/.test(groupId) || extra.length > 0) {
    throw new FetchFailed(USAGE)
  }
  const apiKey = deps.apiKey?.trim()
  if (!apiKey) throw new FetchFailed("SPLITWISE_API_KEY is not set in .env")

  const group = await fetchGroup(deps.fetch, apiKey, groupId)
  const expensePages = await fetchExpensePages(deps.fetch, apiKey, groupId)
  const snapshot: Snapshot = {
    groupId,
    fetchedAt: (deps.now ?? new Date()).toISOString(),
    group,
    expensePages,
  }

  // Written to a temporary name first, so a failed write never leaves half a snapshot behind.
  const outDir = deps.outDir ?? DEFAULT_OUT_DIR
  const target = join(outDir, SNAPSHOT_FILE)
  await mkdir(outDir, { recursive: true })
  await writeFile(`${target}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
  await rename(`${target}.tmp`, target)

  const rows = expensePages.reduce<number>((sum, page) => sum + (expenseRows(page)?.length ?? 0), 0)
  print(`Fetched ${rows} expense rows in ${expensePages.length} pages, and the group.`)
  print(`Wrote ${target}`)
}

if (import.meta.main) {
  try {
    await runFetch(
      process.argv.slice(2),
      { fetch, apiKey: process.env.SPLITWISE_API_KEY },
      (line) => console.log(line),
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
