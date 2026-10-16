// PROTOTYPE, throw away. Invented sample data and a naive forecast for the home screen variants.
// Nothing here is real household data, and none of it is the real model.
import { today } from "@shared/dates"

export type WalletId = "checking" | "savings" | "cash" | "card"

export type Wallet = {
  id: WalletId
  name: string
  inForecast: boolean
  thresholdCents: number
  balanceCheck: { date: string; cents: number } | null
}

export type Planned = {
  id: string
  wallet: WalletId
  date: string
  cents: number
  label: string
  category: string | null
  /** The other Wallet when this is a Planned Transfer (outflow here, inflow there). */
  transferTo?: WalletId
}

export type Actual = {
  id: string
  wallet: WalletId
  date: string
  cents: number
  label: string
}

export type Suggestion = {
  id: string
  actual: Actual
  planned: Planned | null
  /** "match" is a suggested Reconcile; "same" is an import line that looks like a hand entry. */
  kind: "match" | "same"
}

export type ForecastDay = {
  date: string
  balance: number
  items: { label: string; cents: number; overdue: boolean; actual: boolean }[]
}

export type WalletForecast = {
  wallet: Wallet
  todayBalance: number
  days: ForecastDay[]
  lowest: { date: string; balance: number }
  firstBelowThreshold: string | null
  firstBelowZero: string | null
}

// Date arithmetic on YYYY-MM-DD strings through UTC parts, so no string parsing is needed.
function split(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number)
  return [y ?? 0, m ?? 1, d ?? 1]
}
function join(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
export function addDays(date: string, days: number): string {
  const [y, m, d] = split(date)
  return join(Date.UTC(y, m - 1, d + days))
}
function onDay(date: string, day: number, monthOffset: number): string {
  const [y, m] = split(date)
  return join(Date.UTC(y, m - 1 + monthOffset, day))
}
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = split(from)
  const [y2, m2, d2] = split(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}
export function shortDate(date: string): string {
  const [y, m, d] = split(date)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export const TODAY = today()

export const WALLETS: Wallet[] = [
  {
    id: "checking",
    name: "Checking",
    inForecast: true,
    thresholdCents: 50_000,
    balanceCheck: { date: addDays(TODAY, -4), cents: 312_045 },
  },
  {
    id: "savings",
    name: "Savings",
    inForecast: true,
    thresholdCents: 0,
    balanceCheck: { date: addDays(TODAY, -20), cents: 845_000 },
  },
  { id: "cash", name: "Cash", inForecast: true, thresholdCents: 0, balanceCheck: null },
  { id: "card", name: "Credit card", inForecast: false, thresholdCents: 0, balanceCheck: null },
]

export const ACTUALS: Actual[] = [
  { id: "a1", wallet: "checking", date: addDays(TODAY, -2), cents: -8_412, label: "Grocery store" },
  { id: "a2", wallet: "checking", date: addDays(TODAY, -1), cents: -4_500, label: "Gas station" },
]

/** Expands a few invented Schedules into Planned items, plus one Overdue item and a one-off. */
function buildPlanned(horizonDays: number): Planned[] {
  const end = addDays(TODAY, horizonDays)
  const out: Planned[] = []
  const monthly = (
    key: string,
    day: number,
    cents: number,
    label: string,
    category: string | null,
    transferTo?: WalletId,
  ) => {
    for (let i = 0; i < 14; i++) {
      const date = onDay(TODAY, day, i)
      if (date <= TODAY || date > end) continue
      out.push({
        id: `${key}-${date}`,
        wallet: "checking",
        date,
        cents,
        label,
        category,
        transferTo,
      })
    }
  }
  monthly("rent", 1, -185_000, "Landlord", "Housing")
  monthly("power", 15, -14_200, "Power company", "Utilities")
  monthly("phone", 22, -8_500, "Phone carrier", "Utilities")
  monthly("card", 25, -60_000, "Card payment", null, "card")
  monthly("save", 2, -20_000, "To savings", null, "savings")
  // Pay every other week, first one a week out.
  for (let d = addDays(TODAY, 7); d <= end; d = addDays(d, 14)) {
    out.push({
      id: `pay-${d}`,
      wallet: "checking",
      date: d,
      cents: 240_000,
      label: "Employer",
      category: "Pay",
    })
  }
  out.push({
    id: "car",
    wallet: "checking",
    date: addDays(TODAY, 38),
    cents: -112_000,
    label: "Car insurance (one-off)",
    category: "Insurance",
  })
  out.push({
    id: "tax",
    wallet: "checking",
    date: addDays(TODAY, 12),
    cents: -245_000,
    label: "Property tax (one-off)",
    category: "Housing",
  })
  return out
}

export const OVERDUE: Planned[] = [
  {
    id: "internet-overdue",
    wallet: "checking",
    date: addDays(TODAY, -3),
    cents: -7_000,
    label: "Internet provider",
    category: "Utilities",
  },
]

export const SUGGESTIONS: Suggestion[] = [
  {
    id: "s1",
    kind: "match",
    actual: {
      id: "i1",
      wallet: "checking",
      date: addDays(TODAY, -1),
      cents: -14_388,
      label: "POWER CO AUTOPAY",
    },
    planned: {
      id: "p-power",
      wallet: "checking",
      date: addDays(TODAY, -2),
      cents: -14_200,
      label: "Power company",
      category: "Utilities",
    },
  },
  {
    id: "s2",
    kind: "same",
    actual: {
      id: "i2",
      wallet: "checking",
      date: addDays(TODAY, -2),
      cents: -8_412,
      label: "GROCERY #1182",
    },
    planned: null,
  },
]

export function forecast(horizonDays: number): WalletForecast[] {
  const planned = [...buildPlanned(horizonDays), ...OVERDUE]
  return WALLETS.filter((w) => w.inForecast && w.balanceCheck).map((wallet) => {
    const check = wallet.balanceCheck!
    const actuals = ACTUALS.filter((a) => a.wallet === wallet.id && a.date > check.date)
    const todayBalance = check.cents + actuals.reduce((s, a) => s + a.cents, 0)
    // Each Planned item hits its own Wallet, and a Transfer also lands in the other Wallet.
    const mine = planned.flatMap((p) => {
      const date = p.date < TODAY ? TODAY : p.date
      const overdue = p.date < TODAY
      const hits = []
      if (p.wallet === wallet.id) hits.push({ date, label: p.label, cents: p.cents, overdue })
      if (p.transferTo === wallet.id)
        hits.push({ date, label: `From ${p.wallet}`, cents: -p.cents, overdue })
      return hits
    })
    const days: ForecastDay[] = []
    let balance = todayBalance
    for (let i = 0; i <= horizonDays; i++) {
      const date = addDays(TODAY, i)
      const items = mine
        .filter((h) => h.date === date)
        .map((h) => ({ label: h.label, cents: h.cents, overdue: h.overdue, actual: false }))
      if (i === 0)
        items.unshift(
          ...actuals
            .filter((a) => a.date === TODAY)
            .map((a) => ({ label: a.label, cents: a.cents, overdue: false, actual: true })),
        )
      balance += items.filter((x) => !x.actual).reduce((s, x) => s + x.cents, 0)
      days.push({ date, balance, items })
    }
    const lowest = days.reduce((lo, d) => (d.balance < lo.balance ? d : lo), days[0]!)
    return {
      wallet,
      todayBalance,
      days,
      lowest: { date: lowest.date, balance: lowest.balance },
      firstBelowThreshold: days.find((d) => d.balance < wallet.thresholdCents)?.date ?? null,
      firstBelowZero: days.find((d) => d.balance < 0)?.date ?? null,
    }
  })
}

export const MISSING_CHECK = WALLETS.filter((w) => w.inForecast && !w.balanceCheck)

export function upcoming(horizonDays: number, limit: number): Planned[] {
  return buildPlanned(horizonDays)
    .filter((p) => p.date > TODAY)
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
}
