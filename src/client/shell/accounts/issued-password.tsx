import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import type { AdminAccount } from "@/data/admin-accounts"
import { TemporaryPassword } from "@/shell/accounts/temporary-password"

/** What the Admin sees once a temporary password is issued, after a create or a reset. */
export function IssuedPassword({ account, onDone }: { account: AdminAccount; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-medium">{account.name}</span>{" "}
        <span className="text-muted-foreground">({account.email})</span>
      </p>
      {account.temporaryPassword ? (
        <TemporaryPassword password={account.temporaryPassword} />
      ) : null}
      <p className="text-sm text-muted-foreground">
        Send this to them yourself. They must change it when they first sign in.
      </p>
      <DialogFooter>
        <Button className="h-11" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}
