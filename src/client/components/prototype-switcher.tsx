// PROTOTYPE, throwaway: the floating bar that flips between UI prototype variants.
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useEffect, type ReactNode } from "react"

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  children,
}: {
  variants: ReadonlyArray<{ key: string; name: string }>
  current: string
  onChange: (key: string) => void
  /** Extra prototype-only controls, such as who the page is viewed as. */
  children?: ReactNode
}) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  )
  const step = (by: number) =>
    onChange(variants[(index + by + variants.length) % variants.length]!.key)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest("input, textarea, [contenteditable], [role=dialog]")) return
      if (event.key === "ArrowLeft") step(-1)
      if (event.key === "ArrowRight") step(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!import.meta.env.DEV) return null
  const variant = variants[index]!
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1 text-sm text-white shadow-xl ring-2 ring-fuchsia-500">
      <button
        type="button"
        className="rounded-full p-1.5 hover:bg-white/15"
        aria-label="Previous variant"
        onClick={() => step(-1)}
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-1 font-medium whitespace-nowrap">
        {variant.key} ({variant.name})
      </span>
      <button
        type="button"
        className="rounded-full p-1.5 hover:bg-white/15"
        aria-label="Next variant"
        onClick={() => step(1)}
      >
        <ChevronRightIcon className="size-4" />
      </button>
      {children}
    </div>
  )
}
