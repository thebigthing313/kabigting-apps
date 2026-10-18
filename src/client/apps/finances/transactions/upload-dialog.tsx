import { useState } from "react"
import { WalletSelect } from "@/apps/finances/form-controls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { uploadStatement } from "@/data/finances-uploads"
import { useWallets } from "@/data/finances-wallets"
import { UPLOAD_EXTENSIONS, UPLOAD_FORMATS } from "@shared/finances/schemas"

type Step =
  | { step: "file" }
  /** The file's bank account is new to the household: which Wallet is it? */
  | { step: "wallet"; file: File; last4: string }
  | { step: "done"; added: number; duplicates: number; walletName: string }

const TITLES: Record<Step["step"], string> = {
  file: "Upload file",
  wallet: "Which Wallet is this?",
  done: "Upload done",
}

/**
 * Upload file: a bank or card statement download becomes Actuals. On a bank account's first
 * upload it asks for the Wallet, which then remembers the account.
 */
export function UploadDialog({
  open,
  onOpenChange,
  walletId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Wallet to offer first when the file's account is new. */
  walletId?: string
}) {
  const [step, setStep] = useState<Step>({ step: "file" })
  const [busy, setBusy] = useState(false)

  async function send(file: File, chosen?: string) {
    setBusy(true)
    const result = await uploadStatement(file, chosen)
    setBusy(false)
    // A refusal was reported with a toast; the dialog stays as it was.
    if (result === null) return
    if ("needsWallet" in result) {
      setStep({ step: "wallet", file, last4: result.needsWallet.last4 })
    } else {
      setStep({
        step: "done",
        added: result.inserted.length,
        duplicates: result.duplicates,
        walletName: result.wallet.name,
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) setStep({ step: "file" })
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLES[step.step]}</DialogTitle>
          <DialogDescription>
            {step.step === "wallet"
              ? `This is the first file from the account ending ${step.last4}. Pick its Wallet; later files from it go straight there.`
              : step.step === "done"
                ? `Into ${step.walletName}.`
                : `A statement download from the bank or card site: ${UPLOAD_FORMATS}.`}
          </DialogDescription>
        </DialogHeader>
        {step.step === "file" ? (
          <FilePicker busy={busy} onPick={(file) => void send(file)} />
        ) : step.step === "wallet" ? (
          <WalletPicker
            key={step.last4}
            busy={busy}
            walletId={walletId}
            onPick={(chosen) => void send(step.file, chosen)}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-medium" role="status">
              {step.added} added, {step.duplicates} already here
            </p>
            <Button
              className="h-11 self-start"
              onClick={() => {
                setStep({ step: "file" })
                onOpenChange(false)
              }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FilePicker({ busy, onPick }: { busy: boolean; onPick: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [missing, setMissing] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (file) onPick(file)
        else setMissing(true)
      }}
    >
      <FieldGroup>
        <Field data-invalid={missing || undefined}>
          <FieldLabel htmlFor="upload-file">Statement file</FieldLabel>
          <Input
            id="upload-file"
            type="file"
            accept={UPLOAD_EXTENSIONS.join(",")}
            className="h-11 py-2"
            aria-invalid={missing || undefined}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setMissing(false)
            }}
          />
          {missing ? <FieldError>Choose a file to upload</FieldError> : null}
        </Field>
        <Button type="submit" className="h-11 self-start" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </FieldGroup>
    </form>
  )
}

function WalletPicker({
  busy,
  walletId,
  onPick,
}: {
  busy: boolean
  walletId?: string
  onPick: (walletId: string) => void
}) {
  const { data: wallets } = useWallets()
  // A Wallet remembers one bank account, so those that already have one are not offered.
  const choices = wallets.filter((wallet) => !wallet.archived && wallet.bankAccountLast4 === null)
  const [picked, setPicked] = useState(() =>
    choices.some((wallet) => wallet.id === walletId) ? (walletId ?? "") : "",
  )
  const [missing, setMissing] = useState(false)

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (picked !== "") onPick(picked)
        else setMissing(true)
      }}
    >
      <FieldGroup>
        <Field data-invalid={missing || undefined}>
          <FieldLabel htmlFor="upload-wallet">Wallet</FieldLabel>
          <WalletSelect
            id="upload-wallet"
            wallets={choices}
            value={picked}
            invalid={missing}
            onChange={(next) => {
              setPicked(next)
              setMissing(false)
            }}
          />
          {choices.length === 0 ? (
            <FieldDescription>
              Every Wallet already remembers a bank account. Add a Wallet, or Forget the account in
              a Wallet&apos;s Settings.
            </FieldDescription>
          ) : null}
          {missing ? <FieldError>Pick a Wallet</FieldError> : null}
        </Field>
        <Button type="submit" className="h-11 self-start" disabled={busy}>
          {busy ? "Uploading…" : "Upload to this Wallet"}
        </Button>
      </FieldGroup>
    </form>
  )
}
