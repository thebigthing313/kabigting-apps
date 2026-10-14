import { DownloadIcon, PlusSquareIcon, ShareIcon } from "lucide-react"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { isIos, promptInstall, useInstallState } from "@/shell/install-prompt"

/**
 * "Install app": Chrome and Edge show their own prompt; iOS gets the Share → Add to Home Screen
 * steps. Hidden once installed, and where neither applies.
 */
export function InstallMenuItem() {
  const { prompt, installed } = useInstallState()
  const [showIosSteps, setShowIosSteps] = useState(false)
  const ios = isIos()

  if (installed || (!prompt && !ios)) return null

  return (
    <>
      <DropdownMenuItem
        className="min-h-11"
        onClick={() => {
          if (prompt) void promptInstall()
          else setShowIosSteps(true)
        }}
      >
        <DownloadIcon />
        Install app
      </DropdownMenuItem>
      <Dialog open={showIosSteps} onOpenChange={setShowIosSteps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install on iPhone or iPad</DialogTitle>
            <DialogDescription>Add Kabigting Apps to your Home Screen.</DialogDescription>
          </DialogHeader>
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            <li>
              Tap <ShareIcon className="inline size-4 align-text-bottom" aria-label="Share" /> Share
              in Safari's toolbar.
            </li>
            <li>
              Choose <PlusSquareIcon className="inline size-4 align-text-bottom" /> Add to Home
              Screen.
            </li>
            <li>Tap Add, then open Kabigting from your Home Screen.</li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
