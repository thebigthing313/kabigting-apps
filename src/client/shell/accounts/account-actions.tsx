import {
  EllipsisVerticalIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  UndoIcon,
  UserXIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
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
import {
  type AdminAccount,
  useRemoveAccount,
  useResetAccount,
  useRestoreAccount,
  useSetApps,
} from "@/data/admin-accounts"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { AppCheckboxes } from "@/shell/accounts/app-checkboxes"
import { IssuedPassword } from "@/shell/accounts/issued-password"
import type { AppKey } from "@shared/apps"

export type AccountAction = "apps" | "reset" | "remove"

export type ActionTarget = { action: AccountAction; account: AdminAccount }

/** The actions on one Account. The Admin's own row has none. */
export function AccountActionsMenu({
  account,
  onAction,
}: {
  account: AdminAccount
  onAction: (target: ActionTarget) => void
}) {
  const restore = useRestoreAccount()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-11" />}>
        <EllipsisVerticalIcon />
        <span className="sr-only">Actions for {account.email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {account.status === "removed" ? (
          // Restoring gives back nothing the Account did not already have, so no confirmation.
          <DropdownMenuItem
            className="min-h-11"
            disabled={restore.isPending}
            onClick={() =>
              restore.mutate(account.id, {
                onSuccess: () => toast.success(`Restored ${account.name}`),
              })
            }
          >
            <UndoIcon />
            Restore
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => onAction({ action: "apps", account })}
            >
              <LayoutGridIcon />
              Edit Apps
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => onAction({ action: "reset", account })}
            >
              <KeyRoundIcon />
              Reset password
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="min-h-11"
              onClick={() => onAction({ action: "remove", account })}
            >
              <UserXIcon />
              Remove
            </DropdownMenuItem>
          </>
        )}
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

function RemoveAccount({ account, onClose }: { account: AdminAccount; onClose: () => void }) {
  const remove = useRemoveAccount()
  return (
    <ConfirmCommand
      title="Remove Account?"
      description={`Sign ${account.name} out everywhere and block sign-in? Their data is kept and you can restore them.`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      pending={remove.isPending}
      onCancel={onClose}
      onConfirm={() =>
        remove.mutate(account.id, {
          onSuccess: () => {
            toast.success(`Removed ${account.name}`)
            onClose()
          },
          onError: onClose,
        })
      }
    />
  )
}

/** An Admin holds every App through the role, so there is nothing to tick. */
function AdminApps({ account, onClose }: { account: AdminAccount; onClose: () => void }) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Apps</SheetTitle>
          <SheetDescription>
            {account.name} ({account.email}) can open every App.
          </SheetDescription>
        </SheetHeader>
        <p className="px-4 text-sm">The Admin holds every App.</p>
        <SheetFooter>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** Tick the Apps the Account may open; Save sends the whole set at once. */
function EditApps({ account, onClose }: { account: AdminAccount; onClose: () => void }) {
  const save = useSetApps()
  const [apps, setApps] = useState<AppKey[]>(account.apps)

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose()
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Apps</SheetTitle>
          <SheetDescription>
            {account.name} ({account.email}) can open only the ticked Apps.
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate(
              { id: account.id, apps },
              {
                onSuccess: () => {
                  toast.success(`Saved Apps for ${account.name}`)
                  onClose()
                },
              },
            )
          }}
        >
          <div className="px-4">
            <AppCheckboxes value={apps} onChange={setApps} />
          </div>
          <SheetFooter>
            <Button type="submit" className="h-11" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
  switch (action) {
    case "apps":
      if (account.role === "admin") {
        return <AdminApps key={account.id} account={account} onClose={onClose} />
      }
      return <EditApps key={account.id} account={account} onClose={onClose} />
    case "reset":
      return <ResetPassword key={account.id} account={account} onClose={onClose} />
    case "remove":
      return <RemoveAccount key={account.id} account={account} onClose={onClose} />
    default:
      return null
  }
}
