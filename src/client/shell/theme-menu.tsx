import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { type Theme, useTheme } from "@/theme/theme-provider"

const OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
]

function isTheme(value: unknown): value is Theme {
  return OPTIONS.some((option) => option.value === value)
}

/** Light / dark / system, as a submenu of the Account menu. */
export function ThemeMenu() {
  const { theme, resolved, setTheme } = useTheme()
  const CurrentIcon = resolved === "dark" ? MoonIcon : SunIcon
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="min-h-11">
        <CurrentIcon />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value: unknown) => {
            if (isTheme(value)) setTheme(value)
          }}
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="min-h-11">
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
