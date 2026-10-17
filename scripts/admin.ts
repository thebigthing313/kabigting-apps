// Account administration from the command line, beside the Admin's Accounts screen. Use it to
// seed the first Admin and to recover if the Admin is locked out:
//   pnpm admin:create --email <email> --name <name>
//   pnpm admin:create-account --email <email> --name <name> --apps finances,...
//   pnpm admin:reset --email <email>
//   pnpm admin:ban --email <email>
// Temporary passwords are printed once; share them out of band.
import { parseArgs } from "node:util"
import {
  removeAccount,
  createAccount,
  resetAccount,
  type AccountDeps,
} from "#server/auth/accounts.ts"
import { createAuth } from "#server/auth/auth.ts"
import { APP_KEYS, isAppKey } from "#shared/apps.ts"
import { createDb } from "#server/db/client.ts"
import { parseEnv } from "#server/env.ts"

const USAGE = `Usage: admin <create|create-account|reset|ban> --email <email> [--name <name>] [--apps a,b]`

function parseApps(value: string | undefined): string[] {
  const apps = (value ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
  const unknown = apps.filter((a) => !isAppKey(a))
  if (unknown.length > 0) {
    throw new Error(`Unknown App: ${unknown.join(", ")}. Known Apps: ${APP_KEYS.join(", ")}`)
  }
  return apps
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`--${flag} is required\n${USAGE}`)
  return value
}

export async function runAdmin(
  args: readonly string[],
  deps: AccountDeps,
  print: (line: string) => void,
): Promise<void> {
  const [command, ...rest] = args
  const { values } = parseArgs({
    args: [...rest],
    options: { email: { type: "string" }, name: { type: "string" }, apps: { type: "string" } },
  })

  switch (command) {
    case "create": {
      const email = required(values.email, "email")
      const { temporaryPassword } = await createAccount(deps, {
        email,
        name: required(values.name, "name"),
        role: "admin",
        apps: [],
      })
      print(`Created Admin ${email}; the Admin holds every App`)
      print(`Temporary password: ${temporaryPassword}`)
      return
    }
    case "create-account": {
      const email = required(values.email, "email")
      const apps = parseApps(values.apps)
      const { temporaryPassword } = await createAccount(deps, {
        email,
        name: required(values.name, "name"),
        apps,
      })
      print(`Created Account ${email} with Apps: ${apps.join(", ") || "(none)"}`)
      print(`Temporary password: ${temporaryPassword}`)
      return
    }
    case "reset": {
      const email = required(values.email, "email")
      const { temporaryPassword } = await resetAccount(deps, { email })
      print(`Reset ${email}; every session is signed out`)
      print(`Temporary password: ${temporaryPassword}`)
      return
    }
    case "ban": {
      const email = required(values.email, "email")
      await removeAccount(deps, { email })
      print(`Banned ${email}; every session is signed out`)
      return
    }
    default:
      throw new Error(USAGE)
  }
}

if (import.meta.main) {
  const env = parseEnv(process.env)
  const { db, pool } = createDb(env.DATABASE_URL)
  const auth = createAuth({ db, baseURL: env.BASE_URL, secret: env.BETTER_AUTH_SECRET })
  try {
    await runAdmin(process.argv.slice(2), { db, auth }, (line) => console.log(line))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
