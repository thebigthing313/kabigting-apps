import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { OfxError, parseOfx } from "#server/apps/finances/ofx.ts"

// Every sample is made up: the bank ids, account numbers and payees are invented.
function sample(name: string): Uint8Array {
  return readFileSync(new URL(`./ofx-samples/${name}`, import.meta.url))
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

describe("parseOfx", () => {
  test("reads an OFX 1.x (SGML) bank statement: its account and every posted line", () => {
    const statement = parseOfx(sample("bank-sgml.ofx"))
    expect(statement.bankAccount).toEqual({
      hash: sha256("999000111/000012345678"),
      last4: "5678",
    })
    expect(statement.lines).toEqual([
      {
        date: "2026-09-03",
        amountCents: -4217,
        description: "MADE-UP GROCER #12",
        sourceKey: "SAMPLE-BANK-0001",
      },
      {
        date: "2026-09-15",
        amountCents: 125_000,
        description: "EXAMPLE EMPLOYER PAYROLL DIRECT DEP",
        sourceKey: "SAMPLE-BANK-0002",
      },
      {
        date: "2026-09-30",
        amountCents: -850,
        description: "FAKE CAFE & BAKERY",
        sourceKey: "SAMPLE-BANK-0003",
      },
    ])
  })

  test("reads an OFX 2.x (XML) card statement with no sign flip: a purchase out, a payment in", () => {
    const statement = parseOfx(sample("card-xml.ofx"))
    // A card account has no BANKID; the account a line names inside itself is not the statement's.
    expect(statement.bankAccount).toEqual({ hash: sha256("/4000000000009876"), last4: "9876" })
    expect(statement.lines).toEqual([
      {
        date: "2026-09-20",
        amountCents: -6320,
        description: "PRETEND HARDWARE STORE",
        sourceKey: "SAMPLE-CARD-A1",
      },
      {
        date: "2026-09-25",
        amountCents: 20_000,
        description: "PAYMENT THANK YOU",
        sourceKey: "SAMPLE-CARD-A2",
      },
    ])
  })

  test("reads a QFX file, ignoring Intuit's INTU elements, even with no line breaks", () => {
    const statement = parseOfx(sample("quicken.qfx"))
    expect(statement.bankAccount).toEqual({ hash: sha256("999000222/55554444"), last4: "4444" })
    expect(statement.lines).toEqual([
      {
        date: "2026-10-01",
        amountCents: 42,
        description: "INTEREST PAID",
        sourceKey: "SAMPLE-QFX-1",
      },
    ])
  })

  test("reads a QBO card file the same way, with Windows line endings", () => {
    const text = new TextDecoder().decode(sample("quickbooks.qbo")).replaceAll("\n", "\r\n")
    const statement = parseOfx(bytes(text))
    expect(statement.bankAccount).toEqual({ hash: sha256("/XXXXXXXXXXXX1111"), last4: "1111" })
    expect(statement.lines).toEqual([
      {
        date: "2026-10-02",
        amountCents: -1999,
        description: "IMAGINARY STREAMING CO MONTHLY PLAN",
        sourceKey: "SAMPLE-QBO-1",
      },
      {
        date: "2026-10-04",
        amountCents: 500,
        description: "STATEMENT CREDIT",
        sourceKey: "SAMPLE-QBO-2",
      },
    ])
  })

  test("keys a line without a FITID by its content and its place among identical lines", () => {
    const statement = parseOfx(sample("no-fitid.ofx"))
    const keys = statement.lines.map((line) => line.sourceKey)
    const fare = ["2026-10-03", -275, "MADE-UP TRANSIT FARE"]
    expect(keys).toEqual([
      sha256(JSON.stringify([...fare, 0])),
      sha256(JSON.stringify([...fare, 1])),
      sha256(JSON.stringify(["2026-10-04", -275, "MADE-UP TRANSIT FARE", 0])),
    ])
    // The same file read again keys every line the same way.
    expect(parseOfx(sample("no-fitid.ofx")).lines.map((line) => line.sourceKey)).toEqual(keys)
  })

  test("reads a Windows-1252 file's descriptions as that character set says", () => {
    const text = new TextDecoder()
      .decode(sample("bank-sgml.ofx"))
      .replace("MADE-UP GROCER #12", "CAFÉ PRETEND")
    // Every character in the sample fits one byte, so latin1 bytes are its Windows-1252 bytes.
    const file = Uint8Array.from(text, (character) => character.charCodeAt(0))
    expect(parseOfx(file).lines[0]?.description).toBe("CAFÉ PRETEND")
  })

  test("a statement with no lines reads as none", () => {
    const text = new TextDecoder()
      .decode(sample("quicken.qfx"))
      .replace(/<STMTTRN>.*<\/STMTTRN>/, "")
    expect(parseOfx(bytes(text)).lines).toEqual([])
  })

  test.each([
    [
      "a file that isn't OFX",
      "Date,Amount,Description\n2026-10-01,-5.00,SOMETHING\n",
      "isn't an OFX",
    ],
    [
      "a statement that names no account",
      "<OFX><STMTTRN><DTPOSTED>20261001<TRNAMT>-1.00<FITID>A</STMTTRN></OFX>",
      "doesn't name a bank or card account",
    ],
    [
      "two accounts in one file",
      "<OFX><BANKACCTFROM><BANKID>1<ACCTID>11</BANKACCTFROM><BANKACCTFROM><BANKID>1<ACCTID>22</BANKACCTFROM></OFX>",
      "more than one account",
    ],
    [
      "a line with an amount that can't be read",
      "<OFX><CCACCTFROM><ACCTID>11</CCACCTFROM><STMTTRN><DTPOSTED>20261001<TRNAMT>-1.005<FITID>A</STMTTRN></OFX>",
      "Line 1 has no amount",
    ],
    [
      "a line with no real posted date",
      "<OFX><CCACCTFROM><ACCTID>11</CCACCTFROM><STMTTRN><DTPOSTED>20260231<TRNAMT>-1.00<FITID>A</STMTTRN></OFX>",
      "Line 1 has no posted date",
    ],
  ])("refuses %s", (_, text, message) => {
    expect(() => parseOfx(bytes(text))).toThrow(OfxError)
    expect(() => parseOfx(bytes(text))).toThrow(message)
  })
})
