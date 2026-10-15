import { readFileSync } from "node:fs"
import { test as base, expect, type Page } from "@playwright/test"
import { z } from "zod"

const accountsFile = z.object({
  admin: z.object({ email: z.string(), password: z.string() }),
  member: z.object({ email: z.string(), password: z.string() }),
  guest: z.object({ email: z.string(), password: z.string() }),
  newcomers: z.record(z.string(), z.object({ email: z.string(), temporaryPassword: z.string() })),
})

/** The Accounts `scripts/e2e-setup.ts` seeded for this run. */
export function accounts() {
  return accountsFile.parse(JSON.parse(readFileSync("e2e/.auth/accounts.json", "utf8")))
}

/** Where the setup project saves the member's signed-in session. */
export const MEMBER_STATE = "e2e/.auth/member.json"

let ipCounter = 0

/**
 * The server runs the production auth config, which rate-limits sign-in per client address.
 * Each test presents its own address, as separate devices would.
 */
export const test = base.extend({
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures must take an object pattern
  extraHTTPHeaders: async ({}, use, testInfo) => {
    ipCounter += 1
    await use({
      "x-forwarded-for": `10.${testInfo.workerIndex % 250}.${ipCounter % 250}.${testInfo.repeatEachIndex + 1}`,
    })
  },
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
