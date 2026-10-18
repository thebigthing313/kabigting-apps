import { useState } from "react"
import { toast } from "sonner"
import {
  type ActualOnWallet,
  ReconcileSection,
  reconcileBody,
  SuggestedMatches,
} from "@/apps/finances/transactions/reconcile-choices"
import { MarkTransferSection } from "@/apps/finances/transactions/mark-transfer"
import { TransactionForm } from "@/apps/finances/transactions/transaction-form"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  addTransaction,
  deleteTransaction,
  editTransaction,
  type NewTransaction,
  reconcileActual,
  type Transaction,
} from "@/data/finances-transactions"
import { addTransfer, deleteTransfer, editTransfer, type Transfer } from "@/data/finances-transfers"
import { useWallets } from "@/data/finances-wallets"
import type { PlannedItem } from "@shared/finances/reconcile"
import { transferAmountOn } from "@shared/finances/transfers"
import { isImported, isImportedTransfer } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

type Status = NewTransaction["status"]

/** A row of a Wallet's Activity: a Transaction, or a Transfer out of it or into it. */
export type ActivityRow =
  { kind: "transaction"; row: Transaction } | { kind: "transfer"; row: Transfer }

/** The Wallets a row may be put on: every one not archived, plus the ones it is on. */
function useWalletChoices(...keep: (string | undefined)[]) {
  const { data: wallets } = useWallets()
  return wallets.filter((wallet) => !wallet.archived || keep.includes(wallet.id))
}

/** An Activity row's Actual as the Wallet it is opened from sees it, to Reconcile. */
function actualOnWallet(item: ActivityRow, walletId: string): ActualOnWallet {
  if (item.kind === "transaction") return { ...item.row, between: null }
  const { id, date, fromWalletId, toWalletId } = item.row
  const amountCents = transferAmountOn(item.row, walletId)
  return { id, walletId, date, amountCents, between: { fromWalletId, toWalletId } }
}

/** The form is taller than a phone, so it scrolls under a fixed header. */
const SCROLLING = "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]"

/**
 * Adds the row, then Reconciles a new Actual to the ticked match. False when the row was refused;
 * an Actual whose Reconcile was refused is still added, and can be Reconciled from Activity.
 */
async function add(entry: NewTransaction, match: PlannedItem | null): Promise<boolean> {
  const id = newId()
  if (!(await addTransaction(entry, id))) return false
  if (match === null) {
    toast.success(entry.status === "actual" ? "Actual added" : "Planned added")
  } else if (await reconcileActual(reconcileBody(match, id))) {
    toast.success("Actual added and Reconciled")
  } else {
    toast.info("Actual added but not Reconciled; Reconcile it from its Wallet's Activity")
  }
  return true
}

/** Add Actual or one-off Planned, or a Transfer, starting on a Wallet when one is given. */
export function AddTransactionDialog({
  open,
  onOpenChange,
  status,
  walletId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Planned or Actual to start with. */
  status: Status
  /** The Wallet to start on. */
  walletId?: string
}) {
  const wallets = useWalletChoices(walletId)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLING}>
        <DialogHeader>
          <DialogTitle>{status === "actual" ? "Add Actual" : "Add one-off Planned"}</DialogTitle>
          <DialogDescription>
            {status === "actual"
              ? "Money that really moved in or out of a Wallet, or between two."
              : "Money expected to move once, such as a repair bill or a refund."}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 overflow-y-auto px-4 pb-1">
          <TransactionForm
            // A fresh form each time it opens on another Wallet or kind.
            key={`${status}:${walletId ?? ""}`}
            wallets={wallets}
            status={status}
            walletId={walletId}
            matches={SuggestedMatches}
            onSave={async (entry, match) => {
              // Stays open if the server refuses it, keeping what was typed.
              if (await add(entry, match)) onOpenChange(false)
            }}
            onSaveTransfer={async (entry) => {
              if (await addTransfer(entry)) {
                toast.success(
                  entry.status === "actual" ? "Actual Transfer added" : "Planned Transfer added",
                )
                onOpenChange(false)
              }
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Planned", "Actual", "Planned Transfer" or "Actual Transfer". */
function nounOf(editing: ActivityRow): string {
  const status = editing.row.status === "planned" ? "Planned" : "Actual"
  return editing.kind === "transfer" ? `${status} Transfer` : status
}

function importedRow(editing: ActivityRow): boolean {
  return editing.kind === "transfer" ? isImportedTransfer(editing.row) : isImported(editing.row)
}

/** The editor an Activity row opens: every field it may change, and Delete. */
export function EditActivityDialog({
  onWalletId,
  editing,
  onClose,
}: {
  /** The Wallet whose Activity it is opened from. */
  onWalletId: string
  /** The row being edited; null while closed. */
  editing: ActivityRow | null
  onClose: () => void
}) {
  // The row is kept while the dialog closes, so its contents never vanish as it fades.
  const [shown, setShown] = useState(editing)
  if (editing !== null && editing !== shown) setShown(editing)
  const wallets = useWalletChoices(
    ...(shown?.kind === "transfer"
      ? [shown.row.fromWalletId, shown.row.toWalletId]
      : [shown?.row.walletId]),
  )
  const wallet = wallets.find((candidate) => candidate.id === onWalletId)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const noun = shown ? nounOf(shown) : "Actual"
  const imported = shown ? importedRow(shown) : false

  async function remove(target: ActivityRow) {
    setDeleting(true)
    const deleted =
      target.kind === "transfer"
        ? await deleteTransfer(target.row.id)
        : await deleteTransaction(target.row)
    setDeleting(false)
    setConfirming(false)
    if (deleted) {
      toast.success(`${noun} deleted`)
      onClose()
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className={SCROLLING}>
        <DialogHeader>
          <DialogTitle>Edit {noun}</DialogTitle>
          <DialogDescription>
            {shown?.row.status === "planned"
              ? "A one-off Planned item, counted in the Forecast until it happens."
              : shown?.kind === "transfer"
                ? "Money that really moved between two Wallets."
                : "Money that really moved."}
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <div className="-mx-4 flex flex-col gap-6 overflow-y-auto px-4 pb-1">
            {shown.kind === "transfer" ? (
              <TransactionForm
                key={shown.row.id}
                wallets={wallets}
                initialTransfer={shown.row}
                locked={imported}
                onSaveTransfer={async (entry) => {
                  const { accountId, note, fromWalletId, toWalletId, date, amountCents } = entry
                  // An imported Transfer's amount, date and Wallets are the bank's.
                  const changes = imported
                    ? { accountId, note }
                    : { accountId, note, fromWalletId, toWalletId, date, amountCents }
                  if (await editTransfer(shown.row.id, changes)) {
                    toast.success("Saved")
                    onClose()
                  }
                }}
              />
            ) : (
              <TransactionForm
                key={shown.row.id}
                wallets={wallets}
                initial={shown.row}
                locked={imported}
                onSave={async ({ accountId, categoryId, note, walletId, date, amountCents }) => {
                  // An imported Actual's amount, date and Wallet are the bank's; only labels change.
                  const changes = imported
                    ? { accountId, categoryId, note }
                    : { accountId, categoryId, note, walletId, date, amountCents }
                  if (await editTransaction(shown.row.id, changes)) {
                    toast.success("Saved")
                    onClose()
                  }
                }}
              />
            )}
            {shown.row.status === "actual" ? (
              <ReconcileSection
                actual={actualOnWallet(shown, onWalletId)}
                wallet={wallet ?? { shownAsOwed: false }}
                onDone={onClose}
              />
            ) : null}
            {shown.kind === "transaction" && shown.row.status === "actual" ? (
              <MarkTransferSection actual={shown.row} onDone={onClose} />
            ) : null}
            <Button
              variant="outline"
              className="h-11 self-start text-destructive"
              onClick={() => setConfirming(true)}
            >
              Delete {noun}
            </Button>
          </div>
        ) : null}
      </DialogContent>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirming(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {noun}?</AlertDialogTitle>
            <AlertDialogDescription>
              {imported
                ? "It came from the bank, so it is kept as an ignored line that a later upload won't add again. Restore it from Ignored lines."
                : "It is removed for good."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-11"
              disabled={deleting}
              onClick={() => {
                if (shown) void remove(shown)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
