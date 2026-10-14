import { useState } from "react"
import { Input } from "@/components/ui/input"
import { format, parse } from "@shared/money"

type AmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> & {
  /** Cents, or null while empty or not a valid amount. */
  value: number | null
  onValueChange: (cents: number | null) => void
}

/**
 * Money typed as a decimal ("1,250.50", "-45.2"). Every keystroke reports the parsed cents (null
 * when not valid); on blur a valid entry is rewritten in the standard format ("-$45.20").
 */
export function AmountInput({ value, onValueChange, onBlur, ...props }: AmountInputProps) {
  const [text, setText] = useState(() => (value === null ? "" : format(value)))

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        onValueChange(parse(event.target.value))
      }}
      onBlur={(event) => {
        const cents = parse(text)
        if (cents !== null) setText(format(cents))
        onValueChange(cents)
        onBlur?.(event)
      }}
    />
  )
}
