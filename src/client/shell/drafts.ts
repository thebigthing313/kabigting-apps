// Unsaved form input survives the reload that applies an update: forms register a saver, the
// update flow calls them all just before reloading, and the form restores its draft on mount.
const savers = new Set<() => void>()
const PREFIX = "kabigting:draft:"

export function registerDraftSaver(save: () => void): () => void {
  savers.add(save)
  return () => savers.delete(save)
}

export function saveAllDrafts(): void {
  for (const save of savers) save()
}

export function writeDraft(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage unavailable: the draft is lost, nothing else breaks.
  }
}

export function readDraft(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key)
  } catch {
    // Nothing to clear.
  }
}
