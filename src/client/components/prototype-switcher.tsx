// PROTOTYPE, throw away. Floating bar that cycles a page's ?variant= in development builds only.
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useEffect } from "react"

type Variant = { key: string; name: string }

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: readonly Variant[]
  current: string
  onChange: (key: string) => void
}) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  )
  const step = (by: number) => {
    const next = variants[(index + by + variants.length) % variants.length]
    if (next) onChange(next.key)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]"))
        return
      if (event.key === "ArrowLeft") step(-1)
      if (event.key === "ArrowRight") step(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!import.meta.env.DEV) return null
  const variant = variants[index]
  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 p-1 text-sm text-white shadow-lg ring-2 ring-white/40">
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-full hover:bg-white/15"
        onClick={() => step(-1)}
        aria-label="Previous variant"
      >
        <ChevronLeftIcon />
      </button>
      <span className="px-2 font-medium whitespace-nowrap">
        {variant?.key} ({variant?.name})
      </span>
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-full hover:bg-white/15"
        onClick={() => step(1)}
        aria-label="Next variant"
      >
        <ChevronRightIcon />
      </button>
    </div>
  )
}
