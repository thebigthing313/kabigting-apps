import type { AccountDeps } from "#server/auth/accounts.ts"
import type { Auth } from "#server/auth/auth.ts"
import type { Db } from "#server/db/client.ts"

export type Session = Auth["$Infer"]["Session"]

/** The signed-in Account as App routes see it. */
export type Account = { id: string; email: string; name: string; role: string }

/** The parts of Better Auth the app uses, so a test instance with extra plugins also fits. */
export type AuthServer = Pick<Auth, "handler"> &
  AccountDeps["auth"] & { api: Pick<Auth["api"], "getSession"> }

export type Deps = { db: Db; auth: AuthServer }

export type AppEnv = {
  Variables: {
    /** Undefined until loaded, null when there is no session. */
    session: Session | null | undefined
    account: Account
  }
}
