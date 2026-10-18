import { api } from "@/data/api"
import { readJson, reportError } from "@/data/error-handler"
import { writeTransactions } from "@/data/finances-transactions"
import { writeWallet } from "@/data/finances-wallets"
import type { UploadResult } from "@shared/finances/schemas"

/**
 * Sends a statement file to the server, with the Wallet a person picked once it asked for one.
 * The lines it added and the Wallet it remembered are written into their collections. Resolves
 * null after a refusal, which is reported with a toast.
 */
export async function uploadStatement(file: File, walletId?: string): Promise<UploadResult | null> {
  let result: UploadResult
  try {
    result = await readJson(
      await api.finances.uploads.$post({
        form: walletId === undefined ? { file } : { file, walletId },
      }),
    )
  } catch (error) {
    reportError(error, "Uploading")
    return null
  }
  if ("inserted" in result) {
    await writeTransactions(result.inserted)
    await writeWallet(result.wallet)
  }
  return result
}
