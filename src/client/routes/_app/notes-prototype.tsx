// PROTOTYPE, throwaway: three Notes list + editor variants inside the real Shell, for the
// "What do the notes list and the note editor look like?" ticket. `?variant=A|B|C`, `?as=<account>`.
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { ACCOUNTS, useNotesStore } from "@/apps/notes/prototype/store"
import { VariantA } from "@/apps/notes/prototype/variant-a"
import { VariantB } from "@/apps/notes/prototype/variant-b"
import { VariantC } from "@/apps/notes/prototype/variant-c"
import { PrototypeSwitcher } from "@/components/prototype-switcher"

const VARIANTS = [
  { key: "A", name: "List + full-page editor" },
  { key: "B", name: "Card board + dialog" },
  { key: "C", name: "Split pane" },
] as const

export const Route = createFileRoute("/_app/notes-prototype")({
  validateSearch: z.object({
    variant: z.enum(["A", "B", "C"]).optional().catch(undefined),
    as: z.string().optional().catch(undefined),
  }),
  component: NotesPrototype,
})

function NotesPrototype() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const variant = search.variant ?? "A"
  const viewerId = ACCOUNTS.some((account) => account.id === search.as) ? search.as! : "sam"
  return (
    <Variants variant={variant} viewerId={viewerId}>
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) =>
          void navigate({
            search: (prev) => ({ ...prev, variant: VARIANTS.find((v) => v.key === key)?.key }),
            replace: true,
          })
        }
      >
        <select
          aria-label="View as"
          className="ml-1 rounded-full bg-white/15 px-2 py-1 text-white"
          value={viewerId}
          onChange={(event) =>
            void navigate({
              search: (prev) => ({ ...prev, as: event.target.value }),
              replace: true,
            })
          }
        >
          {ACCOUNTS.map((account) => (
            <option key={account.id} value={account.id} className="text-black">
              as {account.name}
            </option>
          ))}
        </select>
      </PrototypeSwitcher>
    </Variants>
  )
}

function Variants({
  variant,
  viewerId,
  children,
}: {
  variant: "A" | "B" | "C"
  viewerId: string
  children: React.ReactNode
}) {
  // The Notes survive switching who you view as; each variant's own UI state starts afresh.
  const store = useNotesStore(viewerId)
  return (
    <>
      {variant === "A" && <VariantA key={viewerId} store={store} />}
      {variant === "B" && <VariantB key={viewerId} store={store} />}
      {variant === "C" && <VariantC key={viewerId} store={store} />}
      {children}
    </>
  )
}
