import { and, eq, inArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isUniqueViolation } from "#server/db/errors.ts"
import { OfxError, type OfxStatement, parseOfx } from "#server/apps/finances/ofx.ts"
import { toTransactionRow } from "#server/apps/finances/transactions.ts"
import { toWalletRow } from "#server/apps/finances/wallets.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import {
  financesTransactions,
  financesTransfers,
  financesWallets,
} from "#server/db/schema/index.ts"
import { UPLOAD_EXTENSIONS, UPLOAD_FORMATS, type UploadResult } from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"

/** The file, and the Wallet a person picked once the server asked for one. */
const uploadForm = z.strictObject({
  file: z.instanceof(File, { message: "Choose a file to upload" }),
  walletId: id.optional(),
})

/** Rows per insert, well inside Postgres's limit on bound parameters. */
const BATCH = 1000

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

async function read(file: File): Promise<OfxStatement> {
  const name = file.name.toLowerCase()
  if (!UPLOAD_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    throw new ApiError("validation_failed", `Upload an ${UPLOAD_FORMATS} file`)
  }
  try {
    return parseOfx(new Uint8Array(await file.arrayBuffer()))
  } catch (error) {
    if (error instanceof OfxError) throw new ApiError("validation_failed", error.message)
    throw error
  }
}

/** Remembers the bank account on the Wallet a person picked for it. */
async function remember(tx: Tx, walletId: string, account: OfxStatement["bankAccount"]) {
  const [chosen] = await tx
    .select()
    .from(financesWallets)
    .where(eq(financesWallets.id, walletId))
    .for("update")
  if (!chosen) throw new ApiError("validation_failed", "No such Wallet")
  if (chosen.archived) throw new ApiError("validation_failed", "That Wallet is archived")
  if (chosen.bankAccountHash !== null) {
    throw new ApiError(
      "conflict",
      `That Wallet already remembers the account ending ${chosen.bankAccountLast4 ?? ""}; Forget it in the Wallet's Settings first`,
    )
  }
  try {
    const [wallet] = await tx
      .update(financesWallets)
      .set({
        bankAccountHash: account.hash,
        bankAccountLast4: account.last4,
        updatedAt: sql`now()`,
      })
      .where(eq(financesWallets.id, walletId))
      .returning()
    return wallet!
  } catch (error) {
    // Another upload of the same account picked a Wallet first.
    if (isUniqueViolation(error)) {
      throw new ApiError("conflict", "This bank account was just mapped to another Wallet")
    }
    throw error
  }
}

/**
 * The keys among `keys` already stored on a Transfer side in this Wallet, ignored Transfers
 * included: a line that became one side of a Transfer is already here.
 */
async function transferKeys(tx: Tx, walletId: string, keys: string[]): Promise<Set<string>> {
  const fromSides = await tx
    .select({ key: financesTransfers.fromSourceKey })
    .from(financesTransfers)
    .where(
      and(
        eq(financesTransfers.fromWalletId, walletId),
        eq(financesTransfers.fromSource, "ofx"),
        inArray(financesTransfers.fromSourceKey, keys),
      ),
    )
  const toSides = await tx
    .select({ key: financesTransfers.toSourceKey })
    .from(financesTransfers)
    .where(
      and(
        eq(financesTransfers.toWalletId, walletId),
        eq(financesTransfers.toSource, "ofx"),
        inArray(financesTransfers.toSourceKey, keys),
      ),
    )
  return new Set([...fromSides, ...toSides].map((side) => side.key ?? ""))
}

/**
 * `POST /uploads`: a bank or card statement download (.ofx, .qfx or .qbo). The file's bank
 * account picks the Wallet; on its first upload the reply asks for one instead. Its posted lines
 * become Actuals, except those whose key the Wallet already stores on a Transaction or a Transfer
 * side, ignored ones included.
 */
export function uploadRoutes(db: Db) {
  return new Hono<AppEnv>().post("/", validate("form", uploadForm), async (c) => {
    const { file, walletId } = c.req.valid("form")
    const statement = await read(file)
    const { bankAccount, lines } = statement

    const result = await db.transaction(async (tx): Promise<UploadResult> => {
      const [known] = await tx
        .select()
        .from(financesWallets)
        .where(eq(financesWallets.bankAccountHash, bankAccount.hash))
      // A remembered account decides the Wallet; one picked for it only matters the first time.
      let wallet = known
      if (!wallet) {
        if (walletId === undefined) return { needsWallet: { last4: bankAccount.last4 } }
        wallet = await remember(tx, walletId, bankAccount)
      }

      const inserted = []
      for (let start = 0; start < lines.length; start += BATCH) {
        const batch = lines.slice(start, start + BATCH)
        const onTransfers = await transferKeys(
          tx,
          wallet.id,
          batch.map((line) => line.sourceKey),
        )
        const fresh = batch.filter((line) => !onTransfers.has(line.sourceKey))
        if (fresh.length === 0) continue
        const rows = await tx
          .insert(financesTransactions)
          .values(
            fresh.map((line) => ({
              status: "actual" as const,
              walletId: wallet.id,
              date: line.date,
              amountCents: line.amountCents,
              bankDescription: line.description,
              source: "ofx" as const,
              sourceKey: line.sourceKey,
            })),
          )
          // A key already stored on this Wallet (ignored or not) is a line already here.
          .onConflictDoNothing()
          .returning()
        inserted.push(...rows)
      }
      return {
        inserted: inserted.map(toTransactionRow),
        duplicates: lines.length - inserted.length,
        wallet: toWalletRow(wallet),
      }
    })
    return c.json(result)
  })
}
