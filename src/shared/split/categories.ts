/**
 * The Categories every household starts with, seeded by the migration that made Split's tables.
 * Members may add, rename or archive Categories later, so read names from the server, not here.
 */
export const SEEDED_CATEGORY_NAMES = [
  "Groceries",
  "Dining out",
  "Household supplies",
  "Home",
  "Utilities",
  "Car",
  "Travel",
  "Pets",
  "Gifts",
  "Entertainment",
  "Personal",
  "General",
] as const

/** The Category a new Expense starts with. */
export const DEFAULT_CATEGORY_NAME = "General"

/** The Category to preselect: the default one by name, or the first offered when it is gone. */
export function defaultCategory<Category extends { name: string }>(
  offered: readonly Category[],
): Category | undefined {
  return (
    offered.find(
      (category) => category.name.toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase(),
    ) ?? offered[0]
  )
}
