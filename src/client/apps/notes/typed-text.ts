// Saving typed text (a Note's title and body, an Item's text): each field saves about a second
// after typing pauses. A save that can't reach the server leaves its field "Not saved", keeping
// the typed text, and is retried in memory on the next keystroke, when the app regains focus or
// when the network comes back. Leaving the page, hiding it or unmounting the editor sends every
// field not yet saved at once, with keepalive. Nothing is stored or queued across reloads.
import { useEffect } from "react"
import type { SaveOptions, SaveOutcome } from "@/data/notes"

/** How long typing must pause before a field saves. */
const SAVE_DELAY_MS = 1_000

const NOW: SaveOptions = { keepalive: false }
const LEAVING: SaveOptions = { keepalive: true }

export type TypedTextSaving<Key extends string> = {
  /** A field's text as typed now. */
  read: (key: Key) => string
  /** Saves a field's text. */
  save: (key: Key, text: string, options: SaveOptions) => Promise<SaveOutcome>
  /** Told whenever the set of "Not saved" fields changes. */
  onNotSaved: (keys: ReadonlySet<Key>) => void
}

/**
 * The saving behind an editor's typed fields, outside React so it outlives the page: saves still
 * run after the editor unmounts. A field's ordinary saves go one after another, so they land in
 * order. Leaving sends at once, beside them: a page being unloaded never runs what waits.
 */
export function createTypedTextSaver<Key extends string>({
  read,
  save,
  onNotSaved,
}: TypedTextSaving<Key>) {
  let stopped = false
  const timers = new Map<Key, ReturnType<typeof setTimeout>>()
  const notSaved = new Set<Key>()
  /** Per field, the saves on their way: their text, and whether they outlive the page. */
  const sending = new Map<Key, { text: string; keepalive: boolean }[]>()
  /** Per field, its ordinary saves in order; a field in `waiting` has one queued, not started. */
  const chains = new Map<Key, Promise<void>>()
  const waiting = new Set<Key>()
  /** Every save not yet settled, for `stop` to wait on. */
  const unsettled = new Set<Promise<void>>()

  function mark(key: Key, unreached: boolean) {
    if (notSaved.has(key) === unreached) return
    if (unreached) notSaved.add(key)
    else notSaved.delete(key)
    onNotSaved(new Set(notSaved))
  }

  function track(saving: Promise<void>) {
    unsettled.add(saving)
    void saving.then(() => unsettled.delete(saving))
  }

  async function send(key: Key, options: SaveOptions): Promise<void> {
    // A save asked for before the editor stopped, as its Note was deleted, must not land after.
    if (stopped) return
    const entry = { text: read(key), keepalive: options.keepalive === true }
    sending.set(key, [...(sending.get(key) ?? []), entry])
    try {
      mark(key, (await save(key, entry.text, options)) === "unreached")
    } catch {
      // A failed save is reported where it failed.
    } finally {
      sending.set(
        key,
        (sending.get(key) ?? []).filter((each) => each !== entry),
      )
    }
  }

  /** Whether a save of the field's current text is on its way (outliving the page, if asked). */
  function alreadySending(key: Key, outlivingOnly: boolean) {
    const text = read(key)
    return (sending.get(key) ?? []).some(
      (each) => each.text === text && (each.keepalive || !outlivingOnly),
    )
  }

  /** An ordinary save, after the field's earlier ones; it reads the text when it runs. */
  function inOrder(key: Key) {
    if (stopped || waiting.has(key)) return
    waiting.add(key)
    const next = (chains.get(key) ?? Promise.resolve()).then(() => {
      waiting.delete(key)
      return send(key, NOW)
    })
    chains.set(key, next)
    track(next)
  }

  /** Sends a field now, with keepalive, without waiting for its saves on their way. */
  function leave(key: Key) {
    if (alreadySending(key, true)) return
    const text = read(key)
    // An earlier save with other text may land after this one; once it has, the latest text
    // goes again so it wins. A queued ordinary save already sends the latest text after it.
    const overtaken =
      !waiting.has(key) && (sending.get(key) ?? []).some((each) => each.text !== text)
    track(send(key, LEAVING))
    if (overtaken) inOrder(key)
  }

  function schedule(key: Key) {
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        inOrder(key)
      }, SAVE_DELAY_MS),
    )
  }

  return {
    /** A field's text changed: save it once typing pauses, retrying any "Not saved" field too. */
    changed(key: Key) {
      if (stopped) return
      schedule(key)
      for (const other of notSaved) if (!timers.has(other)) schedule(other)
    },

    /** Tries every "Not saved" field again, now (focus, reconnect); once per field. */
    retry() {
      for (const key of notSaved) {
        if (!timers.has(key) && !alreadySending(key, false)) inOrder(key)
      }
    },

    /**
     * Sends every field not yet saved at once, with keepalive (leaving, hiding, unmounting):
     * typing still pausing, saves queued and "Not saved" fields. Once per field and text.
     */
    flush() {
      if (stopped) return
      const keys = new Set([...timers.keys(), ...waiting, ...notSaved])
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      // A save on its way as an ordinary request may be cancelled with the page.
      for (const [key, saves] of sending) if (saves.some((each) => !each.keepalive)) keys.add(key)
      for (const key of keys) leave(key)
    },

    /**
     * Stops saving for good: typing not yet saved is dropped and no queued save runs. Resolves
     * once every save on its way has settled.
     */
    async stop(): Promise<void> {
      stopped = true
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      if (notSaved.size > 0) {
        notSaved.clear()
        onNotSaved(new Set())
      }
      await Promise.all(unsettled)
    },
  }
}

/**
 * Ties a saver to the page: retries "Not saved" fields when the app regains focus or the network
 * returns, and sends what is not yet saved at once when the page is hidden, left or the editor
 * unmounts. There is deliberately no `beforeunload` prompt.
 */
export function useTypedTextLifecycle(saver: { flush: () => void; retry: () => void }) {
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saver.flush()
      else saver.retry()
    }
    const retry = () => saver.retry()
    const leave = () => saver.flush()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", retry)
    window.addEventListener("online", retry)
    window.addEventListener("pagehide", leave)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", retry)
      window.removeEventListener("online", retry)
      window.removeEventListener("pagehide", leave)
      saver.flush()
    }
  }, [saver])
}
