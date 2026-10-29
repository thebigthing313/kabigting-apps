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
  /** Told each time a save of the field settles, with how it ended ("failed" when it threw). */
  onSettled?: (key: Key, outcome: SaveOutcome | "failed") => void
}

/**
 * The saving behind an editor's typed fields, outside React so it outlives the page: saves still
 * run after the editor unmounts. A field's ordinary saves, and writes run after them, go one
 * after another, so they land in order. Leaving sends at once, beside them: a page being
 * unloaded never runs what waits.
 */
export function createTypedTextSaver<Key extends string>({
  read,
  save,
  onNotSaved,
  onSettled = () => {},
}: TypedTextSaving<Key>) {
  let stopped = false
  /** Set by `finish`: what is already queued runs, but nothing new is taken. */
  let closed = false
  const timers = new Map<Key, ReturnType<typeof setTimeout>>()
  const notSaved = new Set<Key>()
  /** Per field, the text the server last confirmed. */
  const confirmed = new Map<Key, string>()
  /** Per field, the saves on their way: their text, and whether they outlive the page. */
  const sending = new Map<Key, { text: string; keepalive: boolean }[]>()
  /** Per field, its ordinary saves and writes in order. */
  const chains = new Map<Key, Promise<void>>()
  /** Fields with an ordinary save queued, not started; true when it must send even unchanged. */
  const waiting = new Map<Key, boolean>()
  /** Per field, the sends made on leaving that have not settled; ordinary saves wait for them. */
  const leaving = new Map<Key, Set<Promise<void>>>()
  /** Every save and write not yet settled, for `stop` to wait on. */
  const unsettled = new Set<Promise<void>>()

  function mark(key: Key, unreached: boolean) {
    if (notSaved.has(key) === unreached) return
    if (unreached) notSaved.add(key)
    else notSaved.delete(key)
    onNotSaved(new Set(notSaved))
  }

  function track(work: Promise<void>) {
    unsettled.add(work)
    void work.then(() => unsettled.delete(work))
  }

  /** Whether a save of the field's current text is on its way (outliving the page, if asked). */
  function alreadySending(key: Key, outlivingOnly: boolean) {
    const text = read(key)
    return (sending.get(key) ?? []).some(
      (each) => each.text === text && (each.keepalive || !outlivingOnly),
    )
  }

  async function send(key: Key, options: SaveOptions, force: boolean): Promise<void> {
    // A save asked for before the editor stopped, as its Note was deleted, must not land after.
    if (stopped) return
    const text = read(key)
    // Text the server already holds needs no save, unless other text is still on its way and
    // may land after it.
    const otherOnItsWay = (sending.get(key) ?? []).some((each) => each.text !== text)
    if (!force && confirmed.get(key) === text && !otherOnItsWay) {
      mark(key, false)
      return
    }
    if (!force && alreadySending(key, false)) return
    const entry = { text, keepalive: options.keepalive === true }
    sending.set(key, [...(sending.get(key) ?? []), entry])
    let ended: SaveOutcome | "failed" = "failed"
    try {
      ended = await save(key, text, options)
      if (ended === "saved") confirmed.set(key, text)
      mark(key, ended === "unreached")
    } catch {
      // A failed save is reported where it failed.
    } finally {
      sending.set(
        key,
        (sending.get(key) ?? []).filter((each) => each !== entry),
      )
      onSettled(key, ended)
    }
  }

  /** Runs `work` after the field's earlier saves and writes. */
  /** Runs `work` after the earlier saves and writes of every field given, before their later ones. */
  function after(keys: Key | readonly Key[], work: () => Promise<void>) {
    const list = typeof keys === "string" ? [keys] : keys
    const next = Promise.all(list.map((key) => chains.get(key) ?? Promise.resolve()))
      .then(work)
      .catch(() => {})
    for (const key of list) chains.set(key, next)
    track(next)
  }

  /** An ordinary save, after the field's earlier ones; it reads the text when it runs. */
  function inOrder(key: Key, force = false) {
    if (stopped) return
    if (waiting.has(key)) {
      if (force) waiting.set(key, true)
      return
    }
    waiting.set(key, force)
    after(key, async () => {
      // A send made on leaving, outside the order, lands before this one.
      await Promise.all(leaving.get(key) ?? new Set<Promise<void>>())
      const forced = waiting.get(key) === true
      waiting.delete(key)
      return send(key, NOW, forced)
    })
  }

  /** Sends a field now, with keepalive, without waiting for its saves on their way. */
  function leave(key: Key) {
    if (alreadySending(key, true)) return
    const text = read(key)
    // An earlier save with other text may land after this one; once it has, the latest text
    // goes again so it wins.
    const overtaken = (sending.get(key) ?? []).some((each) => each.text !== text)
    const sent = send(key, LEAVING, false)
    const sends = leaving.get(key) ?? new Set<Promise<void>>()
    sends.add(sent)
    leaving.set(key, sends)
    void sent.then(() => sends.delete(sent))
    track(sent)
    if (overtaken) inOrder(key, true)
  }

  function clearPause(key: Key) {
    clearTimeout(timers.get(key))
    timers.delete(key)
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
      if (stopped || closed) return
      schedule(key)
      for (const other of notSaved) if (!timers.has(other)) schedule(other)
    },

    /** Whether the field's typing is still pausing before it saves. */
    hasPause(key: Key) {
      return timers.has(key)
    },

    /** Whether the field holds text not yet saved: still pausing, or "Not saved". */
    hasUnsaved(key: Key) {
      return timers.has(key) || notSaved.has(key)
    },

    /**
     * Whether the field holds text the server may not have: typing still pausing, a save queued
     * or on its way, or "Not saved". Text from elsewhere must not replace it.
     */
    holdsUnsaved(key: Key) {
      return (
        timers.has(key) ||
        waiting.has(key) ||
        notSaved.has(key) ||
        (sending.get(key) ?? []).length > 0
      )
    },

    /**
     * The server holds `text` for the field, saved from elsewhere: typing it again here is
     * saved like any other change.
     */
    received(key: Key, text: string) {
      confirmed.set(key, text)
    },

    /** Saves the field now, in order, instead of after its pause. */
    saveNow(key: Key) {
      if (closed) return
      clearPause(key)
      inOrder(key)
    },

    /**
     * Runs a write once the earlier saves and writes of every field given have settled; their
     * later saves wait for it. False when saving has stopped or finished, so the write never runs.
     */
    run(keys: Key | readonly Key[], write: () => Promise<unknown>): boolean {
      if (stopped || closed) return false
      after(keys, async () => {
        if (!stopped) await write()
      })
      return true
    },

    /** Forgets a field that is gone, such as a deleted Item: nothing more saves or retries it. */
    forget(key: Key) {
      clearPause(key)
      confirmed.delete(key)
      mark(key, false)
    },

    /** Tries every "Not saved" field again, now (focus, reconnect); once per field. */
    retry() {
      if (closed) return
      for (const key of notSaved) if (!timers.has(key)) inOrder(key)
    },

    /**
     * Sends every field not yet saved at once, with keepalive (leaving, hiding, unmounting):
     * typing still pausing, saves queued and "Not saved" fields. Once per field and text.
     */
    flush() {
      if (stopped || closed) return
      const keys = new Set([...timers.keys(), ...waiting.keys(), ...notSaved])
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      // A save on its way as an ordinary request may be cancelled with the page.
      for (const [key, saves] of sending) if (saves.some((each) => !each.keepalive)) keys.add(key)
      for (const key of keys) leave(key)
    },

    /**
     * Saves every field not yet saved now, in order after its saves on their way (the page stays,
     * so no keepalive), then takes nothing more: later typing, retries and writes are ignored.
     * Resolves once every save and write on its way has settled.
     */
    async finish(): Promise<void> {
      if (!stopped && !closed) {
        const keys = new Set([...timers.keys(), ...notSaved])
        for (const timer of timers.values()) clearTimeout(timer)
        timers.clear()
        for (const key of keys) inOrder(key)
        closed = true
      }
      // A save may queue another as it settles (a tick after an add): wait for those too.
      while (unsettled.size > 0) await Promise.all(unsettled)
    },

    /**
     * Stops saving for good: typing not yet saved is dropped and no queued save or write runs.
     * Resolves once every save and write on its way has settled.
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
 * Ties saving to the page: retries "Not saved" fields when the app regains focus or the network
 * returns, and sends what is not yet saved at once when the page is hidden, left or the editor
 * unmounts. There is deliberately no `beforeunload` prompt.
 */
export function useTypedTextLifecycle(saving: { flush: () => void; retry: () => void }) {
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saving.flush()
      else saving.retry()
    }
    const retry = () => saving.retry()
    const leave = () => saving.flush()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", retry)
    window.addEventListener("online", retry)
    window.addEventListener("pagehide", leave)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", retry)
      window.removeEventListener("online", retry)
      window.removeEventListener("pagehide", leave)
      saving.flush()
    }
  }, [saving])
}
