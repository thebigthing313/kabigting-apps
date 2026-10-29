// Saving typed text (a Note's title and body, an Item's text): each field saves about a second
// after typing pauses. A save that can't reach the server leaves its field "Not saved", keeping
// the typed text, and is retried in memory on the next keystroke, when the app regains focus or
// when the network comes back. Leaving the page, hiding it or unmounting the editor sends what is
// pending at once, with keepalive. Nothing is stored or queued across reloads.
import { useEffect } from "react"
import type { SaveOptions, SaveOutcome } from "@/data/settled"

export type { SaveOptions, SaveOutcome }

/** How long typing must pause before a field saves. */
const SAVE_DELAY_MS = 1_000

const NOW: SaveOptions = { keepalive: false }
const LEAVING: SaveOptions = { keepalive: true }

export type TypedTextSaving<Key extends string> = {
  /** Saves a field's latest text; it reads the text when it runs. */
  save: (key: Key, options: SaveOptions) => Promise<SaveOutcome>
  /** Told whenever the set of "Not saved" fields changes. */
  onNotSaved: (keys: ReadonlySet<Key>) => void
}

/**
 * The saving behind an editor's typed fields, outside React so it outlives the page: saves still
 * run after the editor unmounts. Saves run one at a time, in order, so a field's update never
 * overtakes the create before it, and a delete can wait for the save in flight.
 */
export function createTypedTextSaver<Key extends string>(first: TypedTextSaving<Key>) {
  let handlers = first
  let stopped = false
  const timers = new Map<Key, ReturnType<typeof setTimeout>>()
  /** Saves queued but not yet started; a second ask for one only upgrades it to keepalive. */
  const waiting = new Map<Key, SaveOptions>()
  const notSaved = new Set<Key>()
  let queue: Promise<unknown> = Promise.resolve()

  function mark(key: Key, unreached: boolean) {
    if (notSaved.has(key) === unreached) return
    if (unreached) notSaved.add(key)
    else notSaved.delete(key)
    handlers.onNotSaved(new Set(notSaved))
  }

  function enqueue(key: Key, options: SaveOptions) {
    const queued = waiting.get(key)
    if (queued) {
      if (options.keepalive) queued.keepalive = true
      return
    }
    const asked = { ...options }
    waiting.set(key, asked)
    queue = queue
      .then(async () => {
        waiting.delete(key)
        // A save queued before the editor stopped, as its Note was deleted, must not land after.
        if (stopped) return
        mark(key, (await handlers.save(key, asked)) === "unreached")
      })
      // A failed save is reported where it failed; the saves behind it still run.
      .catch(() => {})
  }

  function schedule(key: Key) {
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        enqueue(key, NOW)
      }, SAVE_DELAY_MS),
    )
  }

  function sendAll(options: SaveOptions) {
    if (stopped) return
    for (const [key, timer] of timers) {
      clearTimeout(timer)
      enqueue(key, options)
    }
    timers.clear()
    for (const key of notSaved) enqueue(key, options)
  }

  return {
    setHandlers(next: TypedTextSaving<Key>) {
      handlers = next
    },

    /** A field's text changed: save it once typing pauses, retrying any "Not saved" field too. */
    changed(key: Key) {
      if (stopped) return
      schedule(key)
      for (const other of notSaved) if (!timers.has(other)) schedule(other)
    },

    /** Tries every "Not saved" field again, now (focus, reconnect). */
    retry() {
      if (stopped) return
      for (const key of notSaved) if (!timers.has(key)) enqueue(key, NOW)
    },

    /** Sends everything not yet saved, now, with keepalive (leaving, hiding, unmounting). */
    flush() {
      sendAll(LEAVING)
    },

    /**
     * Stops saving for good: typing not yet saved is dropped and no queued save runs. Resolves
     * once the save in flight has settled.
     */
    stop(): Promise<unknown> {
      stopped = true
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      if (notSaved.size > 0) {
        notSaved.clear()
        handlers.onNotSaved(new Set())
      }
      return queue
    },
  }
}

export type TypedTextSaver<Key extends string> = ReturnType<typeof createTypedTextSaver<Key>>

/**
 * Ties a saver to the page: retries "Not saved" fields when the app regains focus or the network
 * returns, and sends what is pending at once when the page is hidden, left or the editor
 * unmounts. There is deliberately no `beforeunload` prompt.
 */
export function useTypedTextLifecycle<Key extends string>(saver: TypedTextSaver<Key>) {
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
