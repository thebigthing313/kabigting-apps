import { and, asc, eq, gt, inArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import { isUniqueViolation } from "#server/apps/finances/db-errors.ts"
import type { Db } from "#server/db/client.ts"
import { financesCategories } from "#server/db/schema/index.ts"
import {
  categoryQuery,
  createCategory,
  updateCategory,
  type CategoryRow,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"

type CategoryRecord = typeof financesCategories.$inferSelect

function toRow(category: CategoryRecord): CategoryRow {
  return {
    id: category.id,
    name: category.name,
    archived: category.archived,
    mergedIntoId: category.mergedIntoId,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Category")
}

/** Rethrows a taken name as a conflict the person can act on. */
function nameTaken(error: unknown, name: string | undefined): never {
  if (isUniqueViolation(error)) {
    throw new ApiError("conflict", `A Category named "${name}" already exists`)
  }
  throw error
}

/** Categories: one flat, shared list. Archived or merged, never deleted. */
export function categoryRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post("/query", validate("json", categoryQuery), async (c) => {
      const { ids, limit, after } = c.req.valid("json")
      const categories = await db
        .select()
        .from(financesCategories)
        .where(
          and(
            ids ? inArray(financesCategories.id, ids) : undefined,
            after ? gt(financesCategories.id, after) : undefined,
          ),
        )
        .orderBy(asc(financesCategories.id))
        .limit(limit ?? 5000)
      return c.json({ rows: categories.map(toRow) })
    })
    .post("/", validate("json", createCategory), async (c) => {
      const input = c.req.valid("json")
      // The client supplies the id; an existing id is a conflict, never an overwrite.
      const [category] = await db
        .insert(financesCategories)
        .values(input)
        .onConflictDoNothing({ target: financesCategories.id })
        .returning()
        .catch((error: unknown) => nameTaken(error, input.name))
      if (!category) throw new ApiError("conflict", "A Category with this id already exists")
      return c.json(toRow(category), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateCategory), async (c) => {
      const changes = c.req.valid("json")
      const [category] = await db
        .update(financesCategories)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(financesCategories.id, c.req.valid("param").id))
        .returning()
        .catch((error: unknown) => nameTaken(error, changes.name))
      return category ? c.json(toRow(category)) : notFound()
    })
    .delete("/:id", validate("param", params), () => {
      // D14: history must keep its Category, so the only ways out are archive and merge.
      throw new ApiError("conflict", "Categories are never deleted; archive or merge it instead")
    })
}
