# Grill: ORM and migrations
Type: grilling
Status: resolved
Blocked by: 01, 04

## Question

Decide the ORM (Drizzle?), schema location, migration workflow, how migrations run on Railway deploys, and how Better Auth tables coexist with App tables.

## Answer

Decided with the user (all eight recommendations accepted).

- **ORM:** `drizzle-orm` 0.45.4 stable, pinned. Revisit the 1.0 release later as a contained bump.
- **Driver:** `pg` (node-postgres) with a `Pool`; production uses Railway's private-network `DATABASE_URL`.
- **Better Auth tables:** renamed with `modelName` to an `auth_` prefix (`auth_user`, `auth_session`, `auth_account`, `auth_verification`). The schema comes from `npx auth generate`, is committed, and is never hand-edited; regenerate when the plugin set changes. Our glossary term **Account** means an `auth_user` row; Better Auth's own `account` table (credential links) is not what we call an Account.
- **Schema layout:** `src/server/db/schema/` holds `auth.ts` (generated), `access.ts` (`app_access`), and one file per App (e.g. `finances.ts`), all re-exported from `index.ts`.
- **Conventions:** Drizzle `casing: 'snake_case'`; plural snake_case table names; `created_at`/`updated_at` as `timestamptz`; money columns named `amount_cents` as `bigint` (`number` mode); dates as `date` in `string` mode; App tables namespaced by App (e.g. `finances_transactions`).
- **Keys:** the client generates a UUID for new rows and the server validates it; the column default `uuidv7()` (native in Postgres 18) is the fallback. Insert conflicts fail, so a client can never overwrite another row. App tables point at an Account with a `text` foreign key to `auth_user.id`. Provisional until ticket 16 confirms the optimistic-insert pattern.
- **Dev workflow:** `drizzle-kit generate` writes SQL migrations that are committed and reviewed; `drizzle-kit migrate` applies them locally; `push` is never used. Scripts: `db:generate`, `db:migrate`, `db:studio`.
- **On Railway:** the pre-deploy step runs `node src/server/db/migrate.ts`, using `drizzle-orm`'s programmatic `migrate()` against the committed SQL folder. It needs only runtime dependencies, so `drizzle-kit` is never installed in production. A failed migration fails the deploy and the old version keeps serving.
- **Rollbacks:** forward-only. Recovery is a fix-forward migration or a backup restore (ticket 14). Destructive changes (dropping a column, narrowing a type) ship in a later migration than the code that stops using the old column.
