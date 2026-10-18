import { useState } from "react"
import { toast } from "sonner"
import { isImported } from "@/apps/finances/transactions/transaction-display"
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
  type Transaction,
} from "@/data/finances-transactions"
import { useWallets } from "@/data/finances-wallets"

type Status = NewTransaction["status"]

/** The Wallets a row may be put on: every one not archived, plus the one it is on. */
function useWalletChoices(keep?: string) {
  const { data: wallets } = useWallets()
  return wallets.filter((wallet) => !wallet.archived || wallet.id === keep)
}

/** The form is taller than a phone, so it scrolls under a fixed header. */
const SCROLLING = "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]"

/** Add Actual or one-off Planned, starting on a Wallet when one is given. */
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
              ? "Money that really moved in or out of a Wallet."
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
            onSave={async (entry) => {
              // Stays open if the server refuses it, keeping what was typed.
              if (await addTransaction(entry)) {
                toast.success(entry.status === "actual" ? "Actual added" : "Planned added")
                onOpenChange(false)
              }
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The editor a row opens: every field it may change, and Delete. */
export function EditTransactionDialog({
  transaction,
  onClose,
}: {
  /** The row being edited; null while closed. */
  transaction: Transaction | null
  onClose: () => void
}) {
  // The row is kept while the dialog closes, so its contents never vanish as it fades.
  const [shown, setShown] = useState(transaction)
  if (transaction !== null && transaction !== shown) setShown(transaction)
  const wallets = useWalletChoices(shown?.walletId)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const noun = shown?.status === "planned" ? "Planned" : "Actual"

  async function remove(id: string) {
    setDeleting(true)
    const deleted = await deleteTransaction(id)
    setDeleting(false)
    setConfirming(false)
    if (deleted) {
      toast.success(`${noun} deleted`)
      onClose()
    }
  }

  return (
    <Dialog open={transaction !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className={SCROLLING}>
        <DialogHeader>
          <DialogTitle>Edit {noun}</DialogTitle>
          <DialogDescription>
            {shown?.status === "planned"
              ? "A one-off Planned item, counted in the Forecast until it happens."
              : "Money that really moved."}
          </DialogDescription>
        </DialogHeader>
        {shown ? (
          <div className="-mx-4 flex flex-col gap-6 overflow-y-auto px-4 pb-1">
            <TransactionForm
              key={shown.id}
              wallets={wallets}
              initial={shown}
              locked={isImported(shown)}
              onSave={async ({ status: _status, ...changes }) => {
                if (await editTransaction(shown.id, changes)) {
                  toast.success("Saved")
                  onClose()
                }
              }}
            />
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
              {shown && isImported(shown)
                ? "It came from the bank, so it is kept as an ignored line and won't be added again by a later upload."
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
                if (shown) void remove(shown.id)
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
