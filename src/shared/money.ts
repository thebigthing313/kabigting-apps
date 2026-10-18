/**
 * Money is integer US cents. Amounts are signed: money out is negative, money in is positive.
 */
export const CURRENCY = "USD"

// Optional sign and "$", whole part either plain digits or correctly grouped by commas, then at
// most two decimals.
const AMOUNT = /^([+-])?\$?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/

/** Parses a typed decimal amount ("1,250.50", "-12.3") into cents, or null when malformed. */
export function parse(input: string): number | null {
  const match = AMOUNT.exec(input.trim())
  if (!match) return null
  const [, sign, whole, fraction] = match
  if (whole === undefined && fraction === undefined) return null
  const cents =
    Number((whole ?? "0").replaceAll(",", "")) * 100 + Number((fraction ?? "").padEnd(2, "0"))
  if (!Number.isSafeInteger(cents)) return null
  return sign === "-" && cents !== 0 ? -cents : cents
}

// As AMOUNT, but with any number of decimals.
const ANY_DECIMALS = /^([+-])?\$?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d+))?$/

/**
 * Parses a decimal amount with any number of decimals into cents, rounded to the nearest cent with
 * halves away from zero ("12.345" → 1235, "-0.005" → -1). It works on the digits, never on floats.
 * `rounded` is true when nonzero digits beyond the cent were dropped. Null when malformed.
 */
export function parseToCent(input: string): { cents: number; rounded: boolean } | null {
  const match = ANY_DECIMALS.exec(input.trim())
  if (!match) return null
  const [, sign, whole, fraction] = match
  if (whole === undefined && fraction === undefined) return null
  const kept = fraction?.slice(0, 2)
  const dropped = fraction?.slice(2) ?? ""
  const truncated = parse(`${whole ?? "0"}${kept === undefined ? "" : `.${kept}`}`)
  if (truncated === null) return null
  const magnitude = truncated + ((dropped[0] ?? "0") >= "5" ? 1 : 0)
  if (!Number.isSafeInteger(magnitude)) return null
  return {
    cents: sign === "-" && magnitude !== 0 ? -magnitude : magnitude,
    rounded: /[1-9]/.test(dropped),
  }
}

// Intl formats an exact decimal string, so large amounts never pass through float division.
function toDecimal(cents: number): Intl.StringNumericLiteral {
  const abs = Math.abs(cents)
  const decimal = `${cents < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
  if (!isNumericLiteral(decimal)) throw new RangeError(`Not a cents value: ${cents}`)
  return decimal
}

function isNumericLiteral(value: string): value is `${number}` {
  return /^-?\d+\.\d{2}$/.test(value)
}

const formatters = {
  auto: new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }),
  always: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CURRENCY,
    signDisplay: "exceptZero",
  }),
}

/**
 * Formats cents as US dollars ("-$12.30"). `sign: "always"` adds "+" to inflows so an amount's
 * direction never depends on colour alone.
 */
export function format(cents: number, options: { sign?: "auto" | "always" } = {}): string {
  return formatters[options.sign ?? "auto"].format(toDecimal(cents))
}

/**
 * Rounds a fractional number of cents to whole cents, halves away from zero (2.5 → 3,
 * -2.5 → -3), so rounding an outflow mirrors rounding the same inflow.
 */
export function roundHalfUp(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value))
  return rounded === 0 ? 0 : rounded
}

/**
 * Splits cents by ratios without losing a cent: parts sum exactly to `cents`, each part is within
 * one cent of its exact share, and leftover cents go to the largest remainders (earlier parts win
 * ties). Parts carry the sign of `cents`.
 */
export function allocate(cents: number, ratios: readonly number[]): number[] {
  if (ratios.length === 0 || ratios.some((r) => !Number.isSafeInteger(r) || r < 0)) {
    throw new RangeError("allocate needs non-negative integer ratios")
  }
  const sum = ratios.reduce((a, b) => a + BigInt(b), 0n)
  if (sum === 0n) throw new RangeError("allocate needs at least one positive ratio")

  // BigInt keeps total * ratio exact for any safe-integer amount.
  const total = BigInt(Math.abs(cents))
  const shares = ratios.map((r, index) => {
    const exact = total * BigInt(r)
    return { index, part: exact / sum, remainder: exact % sum }
  })
  let leftover = total - shares.reduce((a, s) => a + s.part, 0n)
  const byRemainder = shares.toSorted((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )
  for (const share of byRemainder) {
    if (leftover === 0n) break
    share.part += 1n
    leftover -= 1n
  }
  const sign = cents < 0 ? -1 : 1
  return shares.map((s) => (s.part === 0n ? 0 : sign * Number(s.part)))
}
