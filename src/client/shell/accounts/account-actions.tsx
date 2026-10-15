import { EllipsisVerticalIcon, KeyRoundIcon } from "lucide-react"
import { useState } from "react"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type AdminAccount, useResetAccount } from "@/data/admin-accounts"
import { IssuedPassword } from "@/shell/accounts/new-account-dialog"

export type AccountAction = "reset"

export type ActionTarget = { action: AccountAction; account: AdminAccount }

/** The actions on one Account. The Admin's own row has none. */
export function AccountActionsMenu({
  account,
  onAction,
}: {
  account: AdminAccount
  onAction: (target: ActionTarget) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-11" />}>
        <EllipsisVerticalIcon />
        <span className="sr-only">Actions for {account.email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem
          className="min-h-11"
          onClick={() => onAction({ action: "reset", account })}
        >
          <KeyRoundIcon />
          Reset password
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A confirmation that stays open, showing progress, until its command finishes. */
function ConfirmCommand({
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel: string
  pendingLabel: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11" disabled={pending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-11"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Confirm, then show the new temporary password. */
function ResetPassword({ account, onClose }: { account: AdminAccount; onClose: () => void }) {
  const reset = useResetAccount()
  const [issued, setIssued] = useState<AdminAccount | null>(null)

  if (issued) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset</DialogTitle>
            <DialogDescription>
              Every session is signed out. They sign in with this temporary password.
            </DialogDescription>
          </DialogHeader>
          <IssuedPassword account={issued} onDone={onClose} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <ConfirmCommand
      title="Reset password?"
      description={`Sign ${account.name} out everywhere and issue a new temporary password?`}
      confirmLabel="Reset password"
      pendingLabel="Resetting…"
      pending={reset.isPending}
      onCancel={onClose}
      onConfirm={() => reset.mutate(account.id, { onSuccess: setIssued, onError: onClose })}
    />
  )
}

/** The dialog for whichever action the Admin picked, if any. */
export function AccountActionDialog({
  target,
  onClose,
}: {
  target: ActionTarget | null
  onClose: () => void
}) {
  if (!target) return null
  const { action, account } = target
  if (action === "reset") {
    return <ResetPassword key={account.id} account={account} onClose={onClose} />
  }
  return null
}
