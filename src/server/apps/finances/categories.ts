import { and, asc, eq, gt, inArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import { isUniqueViolation } from "#server/db/errors.ts"
import { toScheduleRow } from "#server/apps/finances/schedules.ts"
import { toTransactionRow } from "#server/apps/finances/transactions.ts"
import type { Db } from "#server/db/client.ts"
import {
  financesCategories,
  financesSchedules,
  financesTransactions,
} from "#server/db/schema/index.ts"
import {
  categoryQuery,
  createCategory,
  mergeCategory,
  updateCategory,
  type CategoryMergeResult,
  type CategoryRow,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

type CategoryRecord = typeof financesCategories.$inferSelect

export function toCategoryRow(category: CategoryRecord): CategoryRow {
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
        .limit(limit ?? MAX_QUERY_IDS)
      return c.json({ rows: categories.map(toCategoryRow) })
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
      return c.json(toCategoryRow(category), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateCategory), async (c) => {
      const changes = c.req.valid("json")
      const [category] = await db
        .update(financesCategories)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(financesCategories.id, c.req.valid("param").id))
        .returning()
        .catch((error: unknown) => nameTaken(error, changes.name))
      return category ? c.json(toCategoryRow(category)) : notFound()
    })
    .post("/:id/merge", validate("param", params), validate("json", mergeCategory), async (c) => {
      const sourceId = c.req.valid("param").id
      const { intoId } = c.req.valid("json")
      if (intoId === sourceId) {
        throw new ApiError("validation_failed", "A Category can't be merged into itself")
      }
      const result = await db.transaction(async (tx): Promise<CategoryMergeResult> => {
        // Both rows are locked so neither is merged or archived halfway through.
        const locked = await tx
          .select()
          .from(financesCategories)
          .where(inArray(financesCategories.id, [sourceId, intoId]))
          .orderBy(asc(financesCategories.id))
          .for("update")
        const source = locked.find((row) => row.id === sourceId)
        const target = locked.find((row) => row.id === intoId)
        if (!source) notFound()
        if (!target) throw new ApiError("validation_failed", "No such Category to merge into")
        if (source.mergedIntoId !== null) {
          throw new ApiError("conflict", "This Category is already merged")
        }
        if (target.archived) {
          throw new ApiError("conflict", "Merge into a Category in use; unarchive it first")
        }
        // Every Transaction moves, ignored lines included, so a restored line keeps up.
        const transactions = await tx
          .update(financesTransactions)
          .set({ categoryId: intoId, updatedAt: sql`now()` })
          .where(eq(financesTransactions.categoryId, sourceId))
          .returning()
        const schedules = await tx
          .update(financesSchedules)
          .set({ categoryId: intoId, updatedAt: sql`now()` })
          .where(eq(financesSchedules.categoryId, sourceId))
          .returning()
        const [merged] = await tx
          .update(financesCategories)
          .set({ archived: true, mergedIntoId: intoId, updatedAt: sql`now()` })
          .where(eq(financesCategories.id, sourceId))
          .returning()
        if (!merged) throw new Error("The merge wrote nothing")
        return {
          categories: [toCategoryRow(merged)],
          transactions: transactions.map(toTransactionRow),
          schedules: schedules.map(toScheduleRow),
        }
      })
      return c.json(result)
    })
    .delete("/:id", validate("param", params), () => {
      // History must keep its Category, so the only ways out are archive and merge (spec D14).
      throw new ApiError("conflict", "Categories are never deleted; archive or merge it instead")
    })
}
