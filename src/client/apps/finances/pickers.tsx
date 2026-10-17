// The Account and Category pickers forms use: NamePicker wired to the shared collections.
import { NamePicker } from "@/apps/finances/name-picker"
import {
  addFinancesAccount,
  renameFinancesAccount,
  useFinancesAccounts,
} from "@/data/finances-accounts"
import { addCategory, renameCategory, useCategories } from "@/data/finances-categories"

type PickerProps = {
  id?: string
  value: string | null
  onValueChange: (id: string | null) => void
}

export function AccountPicker(props: PickerProps) {
  const { data: accounts } = useFinancesAccounts()
  return (
    <NamePicker
      {...props}
      noun="Account"
      options={accounts}
      onAdd={addFinancesAccount}
      onRename={renameFinancesAccount}
    />
  )
}

export function CategoryPicker(props: PickerProps) {
  const { data: categories } = useCategories()
  return (
    <NamePicker
      {...props}
      noun="Category"
      options={categories}
      onAdd={addCategory}
      onRename={renameCategory}
    />
  )
}
