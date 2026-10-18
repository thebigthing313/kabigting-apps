import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ChevronLeftIcon } from "lucide-react"
import { toast } from "sonner"
import { AddButton } from "@/apps/finances/add-button"
import { ActivityTab } from "@/apps/finances/transactions/activity-tab"
import { BalanceChecksTab } from "@/apps/finances/wallets/balance-checks-tab"
import { WalletBalance } from "@/apps/finances/wallets/wallet-balance"
import { WalletForm } from "@/apps/finances/wallets/wallet-form"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { editWallet, useWallet, type Wallet, type WalletChanges } from "@/data/finances-wallets"

export const WALLET_TABS = ["activity", "checks", "settings"] as const
export type WalletTab = (typeof WALLET_TABS)[number]

const TAB_TITLES: Record<WalletTab, string> = {
  activity: "Activity",
  checks: "Balance checks",
  settings: "Settings",
}

/** One Wallet: its balance, then the Activity, Balance checks and Settings tabs. */
export function WalletPage({ walletId, tab }: { walletId: string; tab: WalletTab }) {
  const { wallet, isLoading } = useWallet(walletId)

  return (
    // Room at the foot for the + button.
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <Link
        to="/finances/wallets"
        className="-ml-2 flex h-10 items-center gap-1 self-start px-2 text-sm text-muted-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        Wallets
      </Link>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : wallet ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold break-words">{wallet.name}</h1>
            <WalletBalance wallet={wallet} />
            {wallet.archived ? <p className="text-sm text-muted-foreground">Archived</p> : null}
          </div>

          <nav aria-label="Wallet tabs" className="flex border-b text-sm">
            {WALLET_TABS.map((key) => (
              <Link
                key={key}
                to="/finances/wallets/$walletId"
                params={{ walletId }}
                search={{ tab: key }}
                aria-current={tab === key ? "page" : undefined}
                className={cn(
                  "flex h-11 flex-1 items-center justify-center border-b-2 px-1 text-center",
                  tab === key
                    ? "border-primary font-medium"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {TAB_TITLES[key]}
              </Link>
            ))}
          </nav>

          {tab === "settings" ? (
            <WalletSettingsTab key={wallet.id} wallet={wallet} />
          ) : tab === "checks" ? (
            <BalanceChecksTab key={wallet.id} wallet={wallet} />
          ) : (
            <ActivityTab key={wallet.id} wallet={wallet} />
          )}
          <AddButton walletId={wallet.id} />
        </>
      ) : (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          There is no such Wallet.
        </p>
      )}
    </div>
  )
}

async function save(id: string, changes: WalletChanges, done: string) {
  if (await editWallet(id, changes)) toast.success(done)
}

function WalletSettingsTab({ wallet }: { wallet: Wallet }) {
  return (
    <div className="flex flex-col gap-6">
      <WalletForm
        initial={wallet}
        submitLabel="Save settings"
        onSave={(settings) => save(wallet.id, settings, "Settings saved")}
      />

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Bank account</h2>
        {wallet.bankAccountLast4 === null ? (
          <p className="text-sm text-muted-foreground">
            None remembered. The first upload for this Wallet remembers its bank account.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">Remembered from uploads: ••••{wallet.bankAccountLast4}</p>
            <Button
              variant="outline"
              className="h-11"
              onClick={() =>
                void save(wallet.id, { bankAccountLast4: null }, "Bank account forgotten")
              }
            >
              Forget
            </Button>
          </div>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{wallet.archived ? "Archived" : "Archive"}</h2>
        <p className="text-sm text-muted-foreground">
          {wallet.archived
            ? "This Wallet is hidden from the Wallets list unless archived Wallets are shown."
            : "Hides this Wallet from the Wallets list. Its history is kept."}
        </p>
        <Button
          variant="outline"
          className="h-11 self-start"
          onClick={() =>
            void save(
              wallet.id,
              { archived: !wallet.archived },
              wallet.archived ? "Wallet unarchived" : "Wallet archived",
            )
          }
        >
          {wallet.archived ? "Unarchive Wallet" : "Archive Wallet"}
        </Button>
      </section>
    </div>
  )
}
