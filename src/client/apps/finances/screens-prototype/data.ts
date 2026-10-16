// PROTOTYPE, throw away. Invented Schedules, Actuals and Balance checks for the Schedule and Wallet
// screen variants. Nothing here is real household data, and none of it is the real model.
import { addDays, TODAY } from "@/apps/finances/home-prototype/data"

export { addDays, shortDate, TODAY } from "@/apps/finances/home-prototype/data"

export type WalletId = "checking" | "savings" | "cash" | "card"

export type WalletSettings = {
  id: WalletId
  name: string
  inForecast: boolean
  thresholdCents: number
  shownAsOwed: boolean
  balanceCents: number
  lastCheck: string | null
}

export const OPEN_ON_HOME: WalletId | "all" = "checking"

export const WALLETS: WalletSettings[] = [
  {
    id: "checking",
    name: "Checking",
    inForecast: true,
    thresholdCents: 50_000,
    shownAsOwed: false,
    balanceCents: 303_133,
    lastCheck: addDays(TODAY, -4),
  },
  {
    id: "savings",
    name: "Savings",
    inForecast: true,
    thresholdCents: 0,
    shownAsOwed: false,
    balanceCents: 845_000,
    lastCheck: addDays(TODAY, -20),
  },
  {
    id: "cash",
    name: "Cash",
    inForecast: true,
    thresholdCents: 0,
    shownAsOwed: false,
    balanceCents: 0,
    lastCheck: null,
  },
  {
    id: "card",
    name: "Credit card",
    inForecast: false,
    thresholdCents: 0,
    shownAsOwed: true,
    balanceCents: -61_240,
    lastCheck: addDays(TODAY, -9),
  },
]

export type Term = { from: string; to: string | null; cents: number; every: string }

export type Schedule = {
  id: string
  account: string | null
  wallet: WalletId
  /** Set when the Schedule makes Transfers: the Wallet the money lands in. */
  transferTo?: WalletId
  category: string | null
  /** The chain of terms, oldest first; each later term is a successor Schedule. */
  terms: Term[]
  ended: string | null
}

export const SCHEDULES: Schedule[] = [
  {
    id: "rent",
    account: "Landlord",
    wallet: "checking",
    category: "Housing",
    terms: [
      { from: "2024-07-01", to: "2025-06-30", cents: -175_000, every: "Monthly on the 1st" },
      { from: "2025-07-01", to: null, cents: -185_000, every: "Monthly on the 1st" },
    ],
    ended: null,
  },
  {
    id: "pay",
    account: "Employer",
    wallet: "checking",
    category: "Pay",
    terms: [{ from: "2025-01-03", to: null, cents: 240_000, every: "Every 2 weeks on Friday" }],
    ended: null,
  },
  {
    id: "power",
    account: "Power company",
    wallet: "checking",
    category: "Utilities",
    terms: [{ from: "2023-03-15", to: null, cents: -14_200, every: "Monthly on the 15th" }],
    ended: null,
  },
  {
    id: "card",
    account: null,
    wallet: "checking",
    transferTo: "card",
    category: null,
    terms: [{ from: "2022-05-25", to: null, cents: -60_000, every: "Monthly on the 25th" }],
    ended: null,
  },
  {
    id: "save",
    account: null,
    wallet: "checking",
    transferTo: "savings",
    category: null,
    terms: [{ from: "2024-01-02", to: null, cents: -20_000, every: "Monthly on the 2nd" }],
    ended: null,
  },
  {
    id: "stream",
    account: "Streaming service",
    wallet: "card",
    category: "Entertainment",
    terms: [{ from: "2023-09-08", to: null, cents: -1_799, every: "Monthly on the 8th" }],
    ended: null,
  },
  {
    id: "gym",
    account: "Gym",
    wallet: "checking",
    category: "Health",
    terms: [{ from: "2022-02-10", to: "2025-11-10", cents: -4_500, every: "Monthly on the 10th" }],
    ended: "2025-11-10",
  },
]

export type OccurrenceState = "computed" | "overridden" | "skipped" | "reconciled" | "overdue"

export type Occurrence = {
  schedule: string
  nominal: string
  date: string
  cents: number
  state: OccurrenceState
}

/** A few Occurrences per Schedule: one past, then the next few, with a stored override and skip. */
export function occurrences(scheduleId: string): Occurrence[] {
  const s = SCHEDULES.find((x) => x.id === scheduleId)
  if (!s) return []
  const cents = s.terms.at(-1)!.cents
  const step = s.id === "pay" ? 14 : 30
  const out: Occurrence[] = []
  for (let i = -2; i < 5; i++) {
    const nominal = addDays(TODAY, i * step + (s.id.length % 7) + 1)
    let state: OccurrenceState = nominal < TODAY ? "reconciled" : "computed"
    let date = nominal
    let amount = cents
    if (s.id === "card" && i === 0) {
      state = "overridden"
      amount = -61_240
      date = addDays(nominal, 2)
    }
    if (s.id === "power" && i === 1) {
      state = "skipped"
    }
    if (s.id === "power" && i === -1) {
      state = "overdue"
    }
    out.push({ schedule: s.id, nominal, date, cents: amount, state })
  }
  return out
}

export function scheduleName(s: Schedule): string {
  if (s.transferTo) {
    const to = WALLETS.find((w) => w.id === s.transferTo)?.name ?? s.transferTo
    return `Transfer to ${to}`
  }
  return s.account ?? "No Account"
}

export function nextOccurrence(scheduleId: string): Occurrence | undefined {
  return occurrences(scheduleId).find((o) => o.date >= TODAY && o.state !== "skipped")
}

export type ActivityRow =
  | {
      kind: "actual"
      id: string
      wallet: WalletId
      date: string
      cents: number
      label: string
      category: string | null
      source: "upload" | "hand"
      /** The Schedule Occurrence it is Reconciled to, if any. */
      reconciledTo: string | null
      toReview?: string
    }
  | {
      kind: "transfer"
      id: string
      wallet: WalletId
      other: WalletId
      date: string
      cents: number
      halves: 1 | 2
    }
  | {
      kind: "check"
      id: string
      wallet: WalletId
      date: string
      cents: number
      /** What the app computed for that date from the previous check and the Actuals since. */
      computedCents: number
    }

export const ACTIVITY: ActivityRow[] = [
  {
    kind: "actual",
    id: "a1",
    wallet: "checking",
    date: addDays(TODAY, -1),
    cents: -14_388,
    label: "POWER CO AUTOPAY",
    category: "Utilities",
    source: "upload",
    reconciledTo: null,
    toReview: "Power company, due 2 days ago",
  },
  {
    kind: "actual",
    id: "a2",
    wallet: "checking",
    date: addDays(TODAY, -1),
    cents: -4_500,
    label: "Gas station",
    category: "Transport",
    source: "hand",
    reconciledTo: null,
  },
  {
    kind: "actual",
    id: "a3",
    wallet: "checking",
    date: addDays(TODAY, -2),
    cents: -8_412,
    label: "GROCERY #1182",
    category: "Groceries",
    source: "upload",
    reconciledTo: null,
    toReview: "Same as your hand entry “Grocery store”?",
  },
  {
    kind: "check",
    id: "c1",
    wallet: "checking",
    date: addDays(TODAY, -4),
    cents: 312_045,
    computedCents: 311_820,
  },
  {
    kind: "transfer",
    id: "t1",
    wallet: "checking",
    other: "savings",
    date: addDays(TODAY, -5),
    cents: -20_000,
    halves: 2,
  },
  {
    kind: "actual",
    id: "a4",
    wallet: "checking",
    date: addDays(TODAY, -6),
    cents: 240_000,
    label: "EMPLOYER PAYROLL",
    category: "Pay",
    source: "upload",
    reconciledTo: "Employer",
  },
  {
    kind: "actual",
    id: "a5",
    wallet: "checking",
    date: addDays(TODAY, -8),
    cents: -185_000,
    label: "RENT PMT 0001",
    category: "Housing",
    source: "upload",
    reconciledTo: "Landlord",
  },
  {
    kind: "transfer",
    id: "t2",
    wallet: "checking",
    other: "card",
    date: addDays(TODAY, -11),
    cents: -58_310,
    halves: 1,
  },
  {
    kind: "actual",
    id: "a6",
    wallet: "checking",
    date: addDays(TODAY, -12),
    cents: -2_650,
    label: "PHARMACY",
    category: null,
    source: "upload",
    reconciledTo: null,
  },
  {
    kind: "check",
    id: "c2",
    wallet: "checking",
    date: addDays(TODAY, -18),
    cents: 286_400,
    computedCents: 286_400,
  },
  {
    kind: "actual",
    id: "a7",
    wallet: "checking",
    date: addDays(TODAY, -20),
    cents: 240_000,
    label: "EMPLOYER PAYROLL",
    category: "Pay",
    source: "upload",
    reconciledTo: "Employer",
  },
  {
    kind: "actual",
    id: "a8",
    wallet: "card",
    date: addDays(TODAY, -3),
    cents: -1_799,
    label: "STREAMING SVC",
    category: "Entertainment",
    source: "upload",
    reconciledTo: "Streaming service",
  },
  {
    kind: "actual",
    id: "a9",
    wallet: "card",
    date: addDays(TODAY, -6),
    cents: -12_740,
    label: "RESTAURANT",
    category: "Dining",
    source: "upload",
    reconciledTo: null,
  },
  {
    kind: "check",
    id: "c3",
    wallet: "card",
    date: addDays(TODAY, -9),
    cents: -61_240,
    computedCents: -61_240,
  },
]

export function activity(wallet: WalletId): ActivityRow[] {
  return ACTIVITY.filter(
    (r) => r.wallet === wallet || (r.kind === "transfer" && r.other === wallet),
  )
}

export function walletName(id: WalletId): string {
  return WALLETS.find((w) => w.id === id)?.name ?? id
}

/** Shown as owed flips the sign for display only. */
export function shown(w: WalletSettings, cents: number): number {
  return w.shownAsOwed ? -cents : cents
}
