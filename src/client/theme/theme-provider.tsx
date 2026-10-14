import { createContext, use, useLayoutEffect, useState, useSyncExternalStore } from "react"
import { THEME_STORAGE_KEY } from "@/theme/storage-key"

export type Theme = "light" | "dark" | "system"

type ThemeState = { theme: Theme; resolved: "light" | "dark"; setTheme: (theme: Theme) => void }

const ThemeContext = createContext<ThemeState | null>(null)
const DARK_QUERY = "(prefers-color-scheme: dark)"

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

function subscribeToSystemTheme(onChange: () => void) {
  const query = matchMedia(DARK_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function systemPrefersDark() {
  return matchMedia(DARK_QUERY).matches
}

/**
 * Light, dark or system theme. The inline script in `<head>` applies the stored choice before
 * first paint; this provider keeps it in sync afterwards.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark)
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolved)
    root.style.colorScheme = resolved
  }, [resolved])

  function setTheme(next: Theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    setThemeState(next)
  }

  return <ThemeContext value={{ theme, resolved, setTheme }}>{children}</ThemeContext>
}

export function useTheme(): ThemeState {
  const state = use(ThemeContext)
  if (!state) throw new Error("useTheme needs a ThemeProvider")
  return state
}
