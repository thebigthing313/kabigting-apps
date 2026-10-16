// PROTOTYPE, throw away. Invented Actuals for the Monthly summary variants: a seeded generator, so
// every month looks plausible. Nothing here is real household data, and none of it is the real model.
import { TODAY } from "@/apps/finances/home-prototype/data"

export type CategoryId = string

export type Category = { id: CategoryId; name: string; archived: boolean }

export const CATEGORIES: Category[] = [
  "Paycheck",
  "Reimbursements",
  "Tax refund",
  "Housing",
  "Loans and mortgage",
  "Groceries",
  "Dining Out",
  "Utilities",
  "Subscriptions",
  "Insurance",
  "Car",
  "Medical",
  "Shopping",
  "Fun and travel",
  "Gifts and charity",
  "Fees",
  "Cash",
].map((name) => ({ id: name.toLowerCase().replaceAll(" ", "-"), name, archived: false }))

CATEGORIES.push({ id: "gaming", name: "Gaming", archived: true })

export type SummaryActual = {
  id: string
  date: string
  cents: number
  label: string
  wallet: string
  category: CategoryId | null
}

/** Months as YYYY-MM. */
export const THIS_MONTH = TODAY.slice(0, 7)

export function addMonths(month: string, by: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const index = y * 12 + (m - 1) + by
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

export function monthLabel(month: string, style: "long" | "short" = "long"): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const date = new Date(0)
  date.setTime(Date.UTC(y, m - 1, 15))
  return date.toLocaleDateString("en-US", {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  })
}

// Seeded so reloads match.
let seed = 42
function rand(): number {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
  return seed / 2_147_483_648
}
function around(cents: number, spread: number): number {
  return Math.round(cents * (1 - spread + rand() * spread * 2))
}

type Pattern = {
  category: CategoryId | null
  label: string[]
  wallet: string
  /** Typical Amount per Transaction, signed. */
  cents: number
  perMonth: number
  spread: number
  /** Only some months. */
  chance?: number
}

const PATTERNS: Pattern[] = [
  {
    category: "paycheck",
    label: ["Employer A"],
    wallet: "Checking",
    cents: 310_000,
    perMonth: 2,
    spread: 0.02,
  },
  {
    category: "paycheck",
    label: ["Employer B"],
    wallet: "Checking",
    cents: 265_000,
    perMonth: 2,
    spread: 0.02,
  },
  {
    category: "reimbursements",
    label: ["Expense report", "Friend paid back"],
    wallet: "Checking",
    cents: 8_500,
    perMonth: 1,
    spread: 0.8,
    chance: 0.5,
  },
  {
    category: "tax-refund",
    label: ["State refund"],
    wallet: "Checking",
    cents: 64_000,
    perMonth: 1,
    spread: 0.1,
    chance: 0.08,
  },
  {
    category: "housing",
    label: ["Landlord"],
    wallet: "Checking",
    cents: -245_000,
    perMonth: 1,
    spread: 0,
  },
  {
    category: "loans-and-mortgage",
    label: ["Car loan", "Student loan"],
    wallet: "Checking",
    cents: -31_000,
    perMonth: 2,
    spread: 0.05,
  },
  {
    category: "groceries",
    label: ["Corner market", "Big box grocer", "Farmers market"],
    wallet: "Credit card",
    cents: -9_200,
    perMonth: 7,
    spread: 0.6,
  },
  {
    category: "dining-out",
    label: ["Noodle bar", "Pizza place", "Cafe", "Taco truck"],
    wallet: "Credit card",
    cents: -4_100,
    perMonth: 6,
    spread: 0.7,
  },
  {
    category: "utilities",
    label: ["Electric co", "Water utility", "Internet"],
    wallet: "Checking",
    cents: -9_800,
    perMonth: 3,
    spread: 0.3,
  },
  {
    category: "subscriptions",
    label: ["Streaming", "Cloud storage", "Music"],
    wallet: "Credit card",
    cents: -1_499,
    perMonth: 3,
    spread: 0.2,
  },
  {
    category: "insurance",
    label: ["Auto insurer"],
    wallet: "Checking",
    cents: -16_500,
    perMonth: 1,
    spread: 0,
  },
  {
    category: "car",
    label: ["Gas station", "Tolls", "Garage"],
    wallet: "Credit card",
    cents: -4_800,
    perMonth: 4,
    spread: 0.6,
  },
  {
    category: "medical",
    label: ["Pharmacy", "Clinic copay", "Vet"],
    wallet: "Credit card",
    cents: -6_000,
    perMonth: 1,
    spread: 0.9,
    chance: 0.6,
  },
  {
    category: "shopping",
    label: ["Online store", "Hardware store", "Bookshop"],
    wallet: "Credit card",
    cents: -5_600,
    perMonth: 4,
    spread: 0.8,
  },
  {
    category: "shopping",
    label: ["Online store refund"],
    wallet: "Credit card",
    cents: 3_200,
    perMonth: 1,
    spread: 0.6,
    chance: 0.35,
  },
  {
    category: "fun-and-travel",
    label: ["Concert", "Hotel", "Airline", "Museum"],
    wallet: "Credit card",
    cents: -18_000,
    perMonth: 1,
    spread: 0.9,
    chance: 0.7,
  },
  {
    category: "gifts-and-charity",
    label: ["Gift shop", "Food bank"],
    wallet: "Credit card",
    cents: -5_000,
    perMonth: 1,
    spread: 0.7,
    chance: 0.5,
  },
  {
    category: "fees",
    label: ["Post office", "DMV"],
    wallet: "Checking",
    cents: -1_800,
    perMonth: 1,
    spread: 0.5,
    chance: 0.4,
  },
  {
    category: "cash",
    label: ["ATM withdrawal"],
    wallet: "Checking",
    cents: -6_000,
    perMonth: 1,
    spread: 0.3,
    chance: 0.6,
  },
  {
    category: "gaming",
    label: ["Game store"],
    wallet: "Credit card",
    cents: -2_999,
    perMonth: 1,
    spread: 0.3,
    chance: 0.4,
  },
  {
    category: null,
    label: ["CHECK 1043", "POS PURCHASE 8812", "Venmo"],
    wallet: "Checking",
    cents: -3_500,
    perMonth: 1,
    spread: 0.8,
    chance: 0.9,
  },
]

function generate(): SummaryActual[] {
  const rows: SummaryActual[] = []
  const today = Number(TODAY.slice(8, 10))
  for (let back = 25; back >= 0; back--) {
    const month = addMonths(THIS_MONTH, -back)
    const lastDay = back === 0 ? today : 28
    for (const p of PATTERNS) {
      // Gaming was archived (merged away) a year ago.
      if (p.category === "gaming" && back < 12) continue
      if (p.chance !== undefined && rand() > p.chance) continue
      for (let i = 0; i < p.perMonth; i++) {
        const day = Math.max(1, Math.min(lastDay, Math.round(1 + rand() * 27)))
        if (back === 0 && day > today) continue
        rows.push({
          id: `${month}-${rows.length}`,
          date: `${month}-${String(day).padStart(2, "0")}`,
          cents: around(p.cents, p.spread),
          label: p.label[Math.floor(rand() * p.label.length)] ?? "",
          wallet: p.wallet,
          category: p.category,
        })
      }
    }
  }
  return rows.toSorted((a, b) => b.date.localeCompare(a.date))
}

export const ACTUALS: SummaryActual[] = generate()

export function actualsIn(month: string, category?: CategoryId | null): SummaryActual[] {
  return ACTUALS.filter(
    (a) => a.date.startsWith(month) && (category === undefined || a.category === category),
  )
}

export type Figures = { income: number; spending: number; net: number }

export type Line = {
  category: CategoryId | null
  name: string
  archived: boolean
  cents: number
  lastMonth: number
  average: number
  /** Last 12 months, oldest first, ending with the chosen month. */
  trend: number[]
}

export type Summary = {
  month: string
  totals: Figures
  lastMonth: Figures
  average: Figures
  /** Every Category with Actuals in the month, last month or the trailing year, then Uncategorised. */
  lines: Line[]
  /** Net per month for the 12 months ending with the chosen month, oldest first. */
  netTrend: { month: string; net: number; income: number; spending: number }[]
}

function figures(rows: SummaryActual[]): Figures {
  // Income and spending by Category sign: a Category that nets positive is income.
  const byCategory = new Map<CategoryId | null, number>()
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.cents)
  let income = 0
  let spending = 0
  for (const cents of byCategory.values()) {
    if (cents > 0) income += cents
    else spending += cents
  }
  return { income, spending, net: income + spending }
}

function averageOf(values: number[]): number {
  return Math.round(values.reduce((s, v) => s + v, 0) / Math.max(1, values.length))
}

/** The trailing 12-month average covers the 12 months before the chosen one. */
export function summary(month: string): Summary {
  const trailing = Array.from({ length: 12 }, (_, i) => addMonths(month, -12 + i))
  const window = [...trailing.slice(1), month]
  const sum = (m: string, c: CategoryId | null) => actualsIn(m, c).reduce((s, a) => s + a.cents, 0)

  const ids = new Set<CategoryId | null>()
  for (const m of [month, ...trailing]) for (const a of actualsIn(m)) ids.add(a.category)

  const lines: Line[] = [...ids].map((id) => {
    const category = CATEGORIES.find((c) => c.id === id)
    return {
      category: id,
      name: category?.name ?? "Uncategorised",
      archived: category?.archived ?? false,
      cents: sum(month, id),
      lastMonth: sum(addMonths(month, -1), id),
      average: averageOf(trailing.map((m) => sum(m, id))),
      trend: window.map((m) => sum(m, id)),
    }
  })
  lines.sort((a, b) => {
    if (a.category === null) return 1
    if (b.category === null) return -1
    return Math.abs(b.cents) - Math.abs(a.cents) || Math.abs(b.average) - Math.abs(a.average)
  })

  const monthly = trailing.map((m) => figures(actualsIn(m)))
  return {
    month,
    totals: figures(actualsIn(month)),
    lastMonth: figures(actualsIn(addMonths(month, -1))),
    average: {
      income: averageOf(monthly.map((f) => f.income)),
      spending: averageOf(monthly.map((f) => f.spending)),
      net: averageOf(monthly.map((f) => f.net)),
    },
    lines,
    netTrend: window.map((m) => ({ month: m, ...figures(actualsIn(m)) })),
  }
}

/** The earliest month with data; the picker stops here. */
export const FIRST_MONTH = addMonths(THIS_MONTH, -25)
