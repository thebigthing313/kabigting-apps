/**
 * Splitwise's own Category names mapped onto Split's twelve seeded Categories (decision #153).
 * These are Splitwise's generic names, not the household's, so the table is committed. A name not
 * here fails the import.
 */
import { SEEDED_CATEGORY_NAMES } from "#shared/split/categories.ts"

type SeededName = (typeof SEEDED_CATEGORY_NAMES)[number]

const OLD_NAMES: Record<SeededName, readonly string[]> = {
  Groceries: ["Groceries", "Liquor"],
  "Dining out": ["Dining out", "Food and drink - Other"],
  "Household supplies": ["Household supplies", "Cleaning"],
  Home: [
    "Furniture",
    "Maintenance",
    "Home - Other",
    "Electronics",
    "Rent",
    "Services",
    "Insurance",
  ],
  Utilities: ["TV/Phone/Internet", "Water", "Electricity", "Heat/gas", "Utilities - Other"],
  Car: ["Car", "Gas/fuel", "Parking"],
  Travel: ["Hotel", "Transportation - Other", "Plane", "Taxi", "Bus/train"],
  Pets: ["Pets"],
  Gifts: ["Gifts"],
  Entertainment: ["Entertainment - Other", "Games", "Music", "Movies"],
  Personal: ["Life - Other", "Clothing", "Medical expenses"],
  General: ["General"],
}

/** Old Splitwise Category name → Split Category name. */
export const CATEGORY_MAP: ReadonlyMap<string, SeededName> = new Map(
  SEEDED_CATEGORY_NAMES.flatMap((name) => OLD_NAMES[name].map((old) => [old, name] as const)),
)

/** The Split Category an old Splitwise Category name lands in, or null when it isn't mapped. */
export function mapCategory(oldName: string): SeededName | null {
  return CATEGORY_MAP.get(oldName.trim()) ?? null
}
