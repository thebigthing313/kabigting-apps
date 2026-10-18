/**
 * The agreed Category mapping (spec §8): 18 new Categories, each with the old ones merged into
 * it. Old names compare trimmed and ignoring case. An old name missing here fails the run.
 */
const MAPPING: readonly (readonly [newName: string, oldNames: readonly string[]])[] = [
  ["Dining Out", ["Dining Out", "Alcohol and Bars", "Coffee Shops"]],
  ["Groceries", ["Groceries"]],
  ["Utilities", ["Utilities"]],
  ["Subscriptions", ["Subscriptions", "Music", "Gaming"]],
  ["Housing", ["Home Services", "Rent", "Moving Expenses"]],
  ["Loans and mortgage", ["Mortgage", "Student Loan", "Loans", "Car Payments"]],
  ["Insurance", ["Insurance"]],
  ["Medical", ["Medical", "Veterinarian"]],
  ["Car", ["Gas", "Tolls", "Parking", "Auto Maintenance", "Cabs"]],
  ["Shopping", ["Shopping", "Refunds", "Technology", "Printing", "Personal Care"]],
  ["Fun and travel", ["Fun Activities", "Gambling", "Travel", "Hotels"]],
  ["Gifts and charity", ["Gifts", "Charity", "Wedding"]],
  ["Fees", ["Bank Fees", "State Fees", "Postage"]],
  ["Cash", ["Withdrawal"]],
  ["Paycheck", ["Paycheck"]],
  [
    "Reimbursements",
    ["Reimbursements", "Deposits", "Freelance", "Sales", "Selling Stuff", "Crossword Income"],
  ],
  ["Tax refund", ["Tax Refund"]],
  ["Card payments", ["Credit Cards"]],
]

/** Old categories that come in Uncategorised. */
const OLD_NAMES_UNCATEGORISED: readonly string[] = ["Savings"]

/** The new Categories, in the table's order. */
export const CATEGORY_NAMES: readonly string[] = MAPPING.map(([newName]) => newName)

const byOldName = new Map<string, string | null>([
  ...MAPPING.flatMap(([newName, oldNames]) =>
    oldNames.map((old) => [old.toLowerCase(), newName] as const),
  ),
  ...OLD_NAMES_UNCATEGORISED.map((old) => [old.toLowerCase(), null] as const),
])

/**
 * The new Category an old category's name maps to: its name, null for Uncategorised, or
 * undefined when the mapping does not list it.
 */
export function mapOldCategory(oldName: string): string | null | undefined {
  return byOldName.get(oldName.trim().toLowerCase())
}
