import { asc, eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { isUniqueViolation } from "#server/db/errors.ts"
import { splitCategories } from "#server/db/schema/index.ts"
import { id } from "#shared/schemas/primitives.ts"
import { createCategory, updateCategory, type CategoryRow } from "#shared/split/schemas.ts"

const params = z.strictObject({ id })

/** The columns a Category goes out with. */
const columns = {
  id: splitCategories.id,
  name: splitCategories.name,
  archived: splitCategories.archived,
}

/** Rethrows a taken name, in any case, as a conflict the Member can act on. */
function nameTaken(error: unknown, name: string | undefined): never {
  if (isUniqueViolation(error)) {
    throw new ApiError("conflict", `A Category named "${name}" already exists`)
  }
  throw error
}

/**
 * Categories: one flat list every Member shares and any Member can add to, rename or archive.
 * Archived, never deleted, so every Expense keeps its Category.
 */
export function categoryRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const rows: CategoryRow[] = await db
        .select(columns)
        .from(splitCategories)
        .orderBy(asc(sql`lower(${splitCategories.name})`), asc(splitCategories.id))
      return c.json({ rows })
    })
    .post("/", validate("json", createCategory), async (c) => {
      const input = c.req.valid("json")
      // The client supplies the id; an id already in use is a conflict, never an overwrite.
      const [category]: CategoryRow[] = await db
        .insert(splitCategories)
        .values(input)
        .onConflictDoNothing({ target: splitCategories.id })
        .returning(columns)
        .catch((error: unknown) => nameTaken(error, input.name))
      if (!category) throw new ApiError("conflict", "A Category with this id already exists")
      return c.json(category, 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateCategory), async (c) => {
      const changes = c.req.valid("json")
      const [category]: CategoryRow[] = await db
        .update(splitCategories)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(splitCategories.id, c.req.valid("param").id))
        .returning(columns)
        .catch((error: unknown) => nameTaken(error, changes.name))
      if (!category) throw new ApiError("not_found", "No such Category")
      return c.json(category)
    })
    .delete("/:id", validate("param", params), () => {
      // Expenses must keep their Category, so the only way out is to archive it.
      throw new ApiError("conflict", "Categories are never deleted; archive it instead")
    })
}
