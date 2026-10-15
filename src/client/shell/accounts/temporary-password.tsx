import { CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** The temporary password the Admin passes on: hidden until shown, copyable either way. */
export function TemporaryPassword({ password, label }: { password: string; label: string }) {
  const id = useId()
  const [shown, setShown] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      toast.success("Copied")
    } catch {
      toast.error("Copy failed", { description: "Show the password and copy it by hand." })
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          readOnly
          type={shown ? "text" : "password"}
          value={password}
          className="h-11 min-w-0 flex-1 font-mono"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
          <span className="sr-only">{shown ? "Hide password" : "Show password"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={() => void copy()}
        >
          <CopyIcon />
          <span className="sr-only">Copy password</span>
        </Button>
      </div>
    </div>
  )
}
