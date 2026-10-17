/** A Finances section's page until its screens arrive: its title and "Nothing here yet". */
export function SectionPlaceholder({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="rounded-xl border p-6 text-center text-muted-foreground">Nothing here yet</p>
    </div>
  )
}

/** The Finances App's home. Empty until the Finances screens arrive. */
export function FinancesHome() {
  return <SectionPlaceholder title="Finances" />
}

export function SchedulesPage() {
  return <SectionPlaceholder title="Schedules" />
}

export function WalletsPage() {
  return <SectionPlaceholder title="Wallets" />
}

export function SummaryPage() {
  return <SectionPlaceholder title="Summary" />
}
