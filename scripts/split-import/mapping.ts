/**
 * The git-ignored file that says which Account each Splitwise user is:
 * `{ "<splitwise user id>": "<account email>" }`. Entries, and so Members, are numbered by
 * Splitwise user id, ascending: JavaScript lists an object's integer keys in that order, whatever
 * order the file gives them in. Messages name an entry by its number, never its values.
 */
import { z } from "zod"

/** Where the real mapping lives; it is git-ignored, beside a committed example. */
export const MAP_FILE = "scripts/split-import.map.json"
export const EXAMPLE_MAP_FILE = "scripts/split-import.map.example.json"

export class MappingInvalid extends Error {}

/** One entry: Member `number` is the Account with `email`. Emails are compared in lower case. */
export type MappingEntry = { number: number; splitwiseId: string; email: string }

const mappingFile = z.record(z.string(), z.unknown())
const email = z.email()

// A JSON string token, escapes included.
const JSON_STRING = /"(?:[^"\\]|\\.)*"/g

/**
 * Every object key in JSON text, in order, repeats included: `JSON.parse` keeps only the last of
 * a repeated key. A string is a key when the next character after it, past spaces, is a colon.
 */
function keysIn(text: string): string[] {
  const keys: string[] = []
  for (const match of text.matchAll(JSON_STRING)) {
    const after = text.slice(match.index + match[0].length).trimStart()
    if (after.startsWith(":")) keys.push(String(JSON.parse(match[0])))
  }
  return keys
}

/** The mapping from the file's text. A Splitwise user id given twice fails, by entry number. */
export function parseMappingText(text: string): MappingEntry[] {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw new MappingInvalid("The mapping file is not valid JSON")
  }
  const entries = parseMapping(file)
  const keys = keysIn(text)
  const repeated = keys.find((key, index) => keys.indexOf(key) !== index)
  if (repeated !== undefined) {
    const entry = entries.find((each) => each.splitwiseId === repeated)
    throw new MappingInvalid(
      `Mapping entry ${entry?.number ?? "?"}: the Splitwise user id is given more than once`,
    )
  }
  return entries
}

export function parseMapping(file: unknown): MappingEntry[] {
  const parsed = mappingFile.safeParse(file)
  if (!parsed.success || Array.isArray(file)) {
    throw new MappingInvalid("The mapping file must be one object of Splitwise user id to email")
  }
  const entries = Object.entries(parsed.data)
  if (entries.length === 0) throw new MappingInvalid("The mapping file maps nobody")
  return entries.map(([splitwiseId, value], index) => {
    const number = index + 1
    if (!/^\d+$/.test(splitwiseId)) {
      throw new MappingInvalid(`Mapping entry ${number}: the Splitwise user id is not a number`)
    }
    const address = email.safeParse(typeof value === "string" ? value.trim() : value)
    if (!address.success) {
      throw new MappingInvalid(`Mapping entry ${number}: the email is not an email address`)
    }
    return { number, splitwiseId, email: address.data.toLowerCase() }
  })
}
