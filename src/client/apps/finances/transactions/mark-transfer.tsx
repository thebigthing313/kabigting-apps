import { useState } from "react"
import { toast } from "sonner"
import { WalletSelect } from "@/apps/finances/form-controls"
import { useReconciledTo } from "@/apps/finances/transactions/reconcile-choices"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { markAsTransfer, type Transaction } from "@/data/finances-transactions"
import { useWallets } from "@/data/finances-wallets"
import { isImported } from "@shared/finances/schemas"

/**
 * The editor's Mark as Transfer section for an Actual: the money really moved to or from another
 * of the household's Wallets, so it becomes an Actual Transfer with no Category. An uploaded
 * line's Transfer then waits for the other Wallet's own line, offered in that Wallet's To review.
 */
export function MarkTransferSection({
  actual,
  onDone,
}: {
  actual: Transaction
  /** After the server turned it into a Transfer. */
  onDone: () => void
}) {
  const { data: wallets } = useWallets()
  const reconciled = useReconciledTo(actual.walletId).has(actual.id)
  const [picking, setPicking] = useState(false)
  const [otherWalletId, setOtherWalletId] = useState("")
  const [pending, setPending] = useState(false)
  const choices = wallets.filter((wallet) => !wallet.archived && wallet.id !== actual.walletId)
  const out = actual.amountCents < 0

  async function mark() {
    setPending(true)
    const ok = await markAsTransfer(actual.id, otherWalletId)
    setPending(false)
    if (ok) {
      toast.success("Marked as a Transfer")
      onDone()
    }
  }

  return (
    <section aria-labelledby="mark-transfer-heading" className="flex flex-col gap-2">
      <h3 id="mark-transfer-heading" className="font-medium">
        Transfer
      </h3>
      {reconciled ? (
        <p className="text-sm text-muted-foreground">
          Un-Reconcile it first to mark it as a Transfer.
        </p>
      ) : picking ? (
        <>
          <Field>
            <FieldLabel htmlFor="mark-transfer-wallet">
              {out ? "Moved to Wallet" : "Moved from Wallet"}
            </FieldLabel>
            <WalletSelect
              id="mark-transfer-wallet"
              wallets={choices}
              value={otherWalletId}
              invalid={false}
              disabled={pending}
              onChange={setOtherWalletId}
            />
            <FieldDescription>
              {isImported(actual)
                ? "It becomes a Transfer with no Category. The other Wallet's own line joins it from that Wallet's To review."
                : "It becomes a Transfer with no Category."}
            </FieldDescription>
          </Field>
          <Button
            className="h-11 self-start"
            disabled={pending || otherWalletId === ""}
            onClick={() => void mark()}
          >
            Mark as Transfer
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={choices.length === 0}
          onClick={() => setPicking(true)}
        >
          Mark as Transfer…
        </Button>
      )}
    </section>
  )
}
