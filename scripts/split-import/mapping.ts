/**
 * The git-ignored file that says which Account each Splitwise user is:
 * `{ "<splitwise user id>": "<account email>" }`. Members are numbered in its order (JavaScript
 * lists integer keys in ascending order). Messages name an entry by its number, never its values.
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
