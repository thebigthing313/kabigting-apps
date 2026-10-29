import { toast } from "sonner"

/**
 * Call after each test that renders a `<Toaster />`. Sonner replays every toast still showing to
 * the next Toaster mounted, so one test's toast would appear in the next; dismissed toasts aren't
 * replayed.
 */
export function dismissToasts() {
  toast.dismiss()
}
