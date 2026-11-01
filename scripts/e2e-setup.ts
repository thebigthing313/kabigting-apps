// Prepares the end-to-end database: recreated, migrated and seeded with known Accounts. Run by
// Playwright's web server command before the production server starts.
import { mkdirSync, writeFileSync } from "node:fs"
import pg from "pg"
import { createAccount, forgetTemporaryPassword, grantApps } from "#server/auth/accounts.ts"
import { createAuth } from "#server/auth/auth.ts"
import { createDb } from "#server/db/client.ts"
import { runMigrations } from "#server/db/migrate.ts"
import { parseEnv } from "#server/env.ts"

const env = parseEnv(process.env)
const url = new URL(env.DATABASE_URL)
const database = url.pathname.slice(1)
if (!/^kabigting_e2e$/.test(database)) throw new Error(`Refusing to reset ${database}`)

const admin = new URL(env.DATABASE_URL)
admin.pathname = "/postgres"
const client = new pg.Client({ connectionString: admin.toString() })
await client.connect()
await client.query(`drop database if exists "${database}" with (force)`)
await client.query(`create database "${database}"`)
await client.end()
await runMigrations(env.DATABASE_URL)

const { db, pool } = createDb(env.DATABASE_URL)
const auth = createAuth({ db, baseURL: env.BASE_URL, secret: env.BETTER_AUTH_SECRET })
const context = await auth.$context

/** An Account whose password is already its own (as after the forced change). */
async function settledAccount(
  email: string,
  name: string,
  password: string,
  apps: string[],
  role: "admin" | "user" = "user",
) {
  const { userId } = await createAccount({ db, auth }, { email, name, apps, role })
  await context.internalAdapter.updatePassword(userId, await context.password.hash(password))
  await context.internalAdapter.updateUser(userId, { mustChangePassword: false })
  await forgetTemporaryPassword(db, userId)
  await grantApps(db, userId, apps)
}

const accounts = {
  admin: { email: "admin@example.com", password: "e2e-admin-password" },
  member: { email: "member@example.com", password: "e2e-member-password" },
  guest: { email: "guest@example.com", password: "e2e-guest-password" },
  // Fresh Accounts for the forced-change test, one per Playwright project.
  newcomers: {} as Record<string, { email: string; temporaryPassword: string }>,
  // Split's Balances are the whole household's, so each Playwright project settles up between its
  // own two Members, and the others' Expenses never move its viewer's Balance.
  split: {} as Record<
    string,
    { email: string; password: string; name: string; partnerName: string }
  >,
}
await settledAccount(accounts.member.email, "Member", accounts.member.password, ["finances"])
await settledAccount(accounts.admin.email, "Admin", accounts.admin.password, [], "admin")
await settledAccount(accounts.guest.email, "Guest", accounts.guest.password, [])
for (const project of ["chromium-desktop", "chromium-phone", "webkit-desktop", "webkit-phone"]) {
  const email = `newcomer-${project}@example.com`
  const { temporaryPassword } = await createAccount(
    { db, auth },
    { email, name: "Newcomer", apps: ["finances"] },
  )
  accounts.newcomers[project] = { email, temporaryPassword }
}
for (const project of ["chromium-desktop", "chromium-phone", "webkit-desktop", "webkit-phone"]) {
  const viewer = {
    email: `split-${project}@example.com`,
    password: `e2e-split-${project}-password`,
    name: `Splitter ${project}`,
    partnerName: `Partner ${project}`,
  }
  await settledAccount(viewer.email, viewer.name, viewer.password, ["split"])
  await settledAccount(
    `split-partner-${project}@example.com`,
    viewer.partnerName,
    `e2e-split-partner-${project}-password`,
    ["split"],
  )
  accounts.split[project] = viewer
}
await pool.end()

mkdirSync("e2e/.auth", { recursive: true })
writeFileSync("e2e/.auth/accounts.json", JSON.stringify(accounts, null, 2))
console.log(`e2e database ${database} ready`)
