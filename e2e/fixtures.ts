import { readFileSync } from "node:fs"
import {
  type APIRequestContext,
  test as base,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test"
import { z } from "zod"

const accountsFile = z.object({
  admin: z.object({ email: z.string(), password: z.string() }),
  member: z.object({ email: z.string(), password: z.string() }),
  guest: z.object({ email: z.string(), password: z.string() }),
  newcomers: z.record(z.string(), z.object({ email: z.string(), temporaryPassword: z.string() })),
  split: z.record(
    z.string(),
    z.object({
      email: z.string(),
      password: z.string(),
      name: z.string(),
      partnerName: z.string(),
    }),
  ),
})

/** The Accounts `scripts/e2e-setup.ts` seeded for this run. */
export function accounts() {
  return accountsFile.parse(JSON.parse(readFileSync("e2e/.auth/accounts.json", "utf8")))
}

/** Where the setup project saves the member's signed-in session. */
export const MEMBER_STATE = "e2e/.auth/member.json"

let ipCounter = 0

/** Each test's run names, by test id, for archiving what it made once it ends. */
const runNames = new Map<string, string[]>()

/**
 * A name part unique to this test: its project and the time. Every e2e run shares one database,
 * so the Wallets a test names with it are archived when the test ends. Otherwise every Finances
 * page would keep loading the Forecasts of every Wallet that earlier tests made.
 */
export function runName(testInfo: TestInfo): string {
  const run = `${testInfo.project.name} ${Date.now()}`
  runNames.set(testInfo.testId, [...(runNames.get(testInfo.testId) ?? []), run])
  return run
}

const walletRows = z.object({
  rows: z.array(z.object({ id: z.string(), name: z.string(), archived: z.boolean() })),
})

/** Archives the Wallets named with any of `runs`. A signed-out session archives nothing. */
async function archiveWallets(request: APIRequestContext, runs: readonly string[]) {
  const response = await request.post("/api/finances/wallets/query", { data: {} })
  if (!response.ok()) return
  const { rows } = walletRows.parse(await response.json())
  const made = rows.filter((row) => !row.archived && runs.some((run) => row.name.includes(run)))
  await Promise.all(
    made.map((row) =>
      request.patch(`/api/finances/wallets/${row.id}`, { data: { archived: true } }),
    ),
  )
}

/**
 * The server runs the production auth config, which rate-limits sign-in per client address.
 * Each test presents its own address, as separate devices would.
 */
export const test = base.extend<{ archiveRunWallets: void }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures must take an object pattern
  extraHTTPHeaders: async ({}, use, testInfo) => {
    ipCounter += 1
    await use({
      "x-forwarded-for": `10.${testInfo.workerIndex % 250}.${ipCounter % 250}.${testInfo.repeatEachIndex + 1}`,
    })
  },
  archiveRunWallets: [
    async ({ context }, use, testInfo) => {
      await use()
      const runs = runNames.get(testInfo.testId) ?? []
      runNames.delete(testInfo.testId)
      if (runs.length > 0) await archiveWallets(context.request, runs)
    },
    { auto: true },
  ],
})

export { expect }

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

/** The Account menu lives in the sidebar, which is a drawer on phones. */
export async function openAccountMenu(page: Page, name: string) {
  const account = page.getByRole("button", { name: new RegExp(name) })
  if (!(await account.isVisible()))
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await account.click()
}

let addressCounter = 0

/**
 * Moves the page to a fresh client address. A test that signs in several times does this first,
 * so the per-address sign-in rate limit sees separate devices.
 */
export async function useNewAddress(page: Page) {
  addressCounter += 1
  const worker = test.info().workerIndex % 16
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `172.${16 + worker}.${Math.floor(addressCounter / 250) % 250}.${(addressCounter % 250) + 1}`,
  })
}
