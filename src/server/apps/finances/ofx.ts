// A small reader for bank and card statement downloads: OFX 1.x (SGML) and 2.x (XML). QFX
// (Quicken) and QBO (QuickBooks Web Connect) are the same format with Intuit's extra elements,
// which are ignored like any other element it doesn't read. Only what an upload stores leaves
// this file: the bank account as a hash and its last four characters, never the full number.
import { createHash } from "node:crypto"
import { parse as parseCents } from "#shared/money.ts"
import { isoDate } from "#shared/schemas/primitives.ts"

/** One posted line. Its amount is signed as OFX gives it, from the customer's side (D16). */
export type OfxLine = {
  date: string
  amountCents: number
  /** The bank's NAME and MEMO; null when it gave neither. */
  description: string | null
  /** The FITID, or a content hash when the bank gave none. */
  sourceKey: string
}

export type OfxStatement = {
  /** SHA-256 of the BANKID/ACCTID pair, and the account id's last four characters. */
  bankAccount: { hash: string; last4: string }
  lines: OfxLine[]
}

/** The file can't be read as a statement; the message says why, for the person uploading it. */
export class OfxError extends Error {}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/** OFX 1.x names its character set in the header; 2.x in the XML declaration. */
function decode(file: Uint8Array): string {
  const header = new TextDecoder("latin1").decode(file.subarray(0, 2048))
  const western =
    /^CHARSET:\s*(1252|ISO-8859-1)\s*$/im.test(header) ||
    /encoding="(windows-1252|iso-8859-1)"/i.test(header)
  return new TextDecoder(western ? "windows-1252" : "utf-8").decode(file)
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

function unescape(text: string): string {
  return text.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith("#")) {
      const code =
        entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : +entity.slice(1)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return ENTITIES[entity.toLowerCase()] ?? whole
  })
}

/** A start tag with the text after it, or an end tag. SGML leaves have no end tag; XML's do. */
const TAG = /<(\/?)([A-Za-z0-9._]+)\s*(\/?)>([^<]*)/g

const LINE_FIELDS = new Set(["TRNAMT", "DTPOSTED", "FITID", "NAME", "MEMO"])
const ACCOUNT_FROM = new Set(["BANKACCTFROM", "CCACCTFROM"])

type Fields = Map<string, string>

/** The elements this reader uses: each statement account and each line, as raw text values. */
function scan(body: string): { accounts: Fields[]; lines: Fields[] } {
  const accounts: Fields[] = []
  const lines: Fields[] = []
  let line: Fields | null = null
  let account: Fields | null = null
  for (const [, closing, rawName, selfClosing, after] of body.matchAll(TAG)) {
    const name = rawName!.toUpperCase()
    if (closing) {
      if (name === "STMTTRN" && line) {
        lines.push(line)
        line = null
      } else if (ACCOUNT_FROM.has(name) && account) {
        accounts.push(account)
        account = null
      }
      continue
    }
    if (name === "STMTTRN") {
      line = new Map()
      continue
    }
    if (ACCOUNT_FROM.has(name)) {
      account = new Map()
      continue
    }
    const value = selfClosing ? "" : unescape(after!).trim()
    if (value === "") continue
    // Accounts named inside a line (a transfer's destination) are not the statement's.
    if (line) {
      if (LINE_FIELDS.has(name) && !line.has(name)) line.set(name, value)
    } else if (account && (name === "BANKID" || name === "ACCTID")) {
      account.set(name, value)
    }
  }
  return { accounts, lines }
}

function bankAccount(accounts: readonly Fields[]): OfxStatement["bankAccount"] {
  const pairs = new Set(
    accounts
      .filter((account) => account.has("ACCTID"))
      .map((account) => `${account.get("BANKID") ?? ""}/${account.get("ACCTID")}`),
  )
  const [pair, ...others] = pairs
  if (pair === undefined) throw new OfxError("The file doesn't name a bank or card account")
  if (others.length > 0)
    throw new OfxError("The file holds more than one account; upload one at a time")
  const accountId = pair.slice(pair.indexOf("/") + 1)
  return { hash: sha256(pair), last4: accountId.slice(-4) }
}

/** DTPOSTED's first eight digits are the bank's own calendar date; its time and zone are not used. */
function postedDate(value: string | undefined, ordinal: number): string {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value ?? "")
  const date = match ? `${match[1]}-${match[2]}-${match[3]}` : ""
  if (!isoDate.safeParse(date).success) {
    throw new OfxError(`Line ${ordinal} has no posted date that can be read`)
  }
  return date
}

function amount(value: string | undefined, ordinal: number): number {
  const cents = value === undefined ? null : parseCents(value)
  if (cents === null) throw new OfxError(`Line ${ordinal} has no amount that can be read`)
  return cents
}

function description(fields: Fields): string | null {
  const name = fields.get("NAME")
  const memo = fields.get("MEMO")
  const parts = memo === name ? [name] : [name, memo]
  const text = parts.filter((part) => part !== undefined).join(" ")
  return text === "" ? null : text
}

/**
 * Reads a statement download. Every line in it is posted (OFX statements carry no pending
 * lines), so none is filtered. Throws `OfxError` when the file can't be read as a statement.
 */
export function parseOfx(file: Uint8Array): OfxStatement {
  const text = decode(file)
  const start = text.search(/<OFX>/i)
  if (start === -1) throw new OfxError("This isn't an OFX, QFX or QBO file")
  const { accounts, lines } = scan(text.slice(start))
  const account = bankAccount(accounts)

  // A line without a FITID is known by its content and its place among identical lines.
  const seen = new Map<string, number>()
  return {
    bankAccount: account,
    lines: lines.map((fields, index) => {
      const date = postedDate(fields.get("DTPOSTED"), index + 1)
      const amountCents = amount(fields.get("TRNAMT"), index + 1)
      const words = description(fields)
      let sourceKey = fields.get("FITID")
      if (sourceKey === undefined) {
        const content = JSON.stringify([date, amountCents, words ?? ""])
        const ordinal = seen.get(content) ?? 0
        seen.set(content, ordinal + 1)
        sourceKey = sha256(JSON.stringify([date, amountCents, words ?? "", ordinal]))
      }
      return { date, amountCents, description: words, sourceKey }
    }),
  }
}
