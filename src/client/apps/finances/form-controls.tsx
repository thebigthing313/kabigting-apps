// Form controls the Finances forms share: a Wallet select, a segmented choice, and the money
// direction typed as the Wallet shows it.
import { cn } from "cn"
import { FieldLegend, FieldSet } from "@/components/ui/field"

export type WalletOption = { id: string; name: string; shownAsOwed: boolean }

/** The sign as the Wallet shows it; flipped from the stored sign on a Wallet shown as owed. */
export type ShownSign = "minus" | "plus"

/** Money in or out, worded as the Wallet shows it (D15). */
export function directionOptions(owed: boolean): { value: ShownSign; label: string }[] {
  return owed
    ? [
        { value: "plus", label: "Adds to what's owed" },
        { value: "minus", label: "Pays down what's owed" },
      ]
    : [
        { value: "minus", label: "Money out" },
        { value: "plus", label: "Money in" },
      ]
}

export const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"

/** Picks one of the Wallets by id; "" while none is picked. */
export function WalletSelect({
  id,
  wallets,
  value,
  invalid,
  disabled = false,
  onBlur,
  onChange,
}: {
  id: string
  wallets: readonly WalletOption[]
  value: string
  invalid: boolean
  disabled?: boolean
  onBlur?: () => void
  onChange: (walletId: string) => void
}) {
  return (
    <select
      id={id}
      className={cn(selectClass, "disabled:opacity-50")}
      value={value}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={invalid || undefined}
    >
      <option value="">Pick a Wallet</option>
      {wallets.map((wallet) => (
        <option key={wallet.id} value={wallet.id}>
          {wallet.name}
        </option>
      ))}
    </select>
  )
}

/** Two or more choices shown side by side, one picked. */
export function Choice<Value extends string>({
  legend,
  name,
  value,
  options,
  disabled = false,
  onChange,
}: {
  legend: string
  name: string
  value: Value
  options: readonly { value: Value; label: string }[]
  disabled?: boolean
  onChange: (value: Value) => void
}) {
  return (
    <FieldSet disabled={disabled} className="disabled:opacity-50">
      <FieldLegend variant="label">{legend}</FieldLegend>
      <div className="grid grid-cols-2 rounded-lg border p-0.5 text-sm">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-10 cursor-pointer items-center justify-center rounded-md px-2 py-1 text-center leading-tight has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </FieldSet>
  )
}
