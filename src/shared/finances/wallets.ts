/**
 * A Wallet "shown as owed", such as a credit card, holds a negative balance but is read and typed
 * as a positive amount owed. Only entry and display flip; stored Amounts keep their real sign.
 */
import { format } from "../money.ts"

type Shown = { shownAsOwed: boolean }

function flip(cents: number): number {
  return cents === 0 ? 0 : -cents
}

/** The Amount as this Wallet displays it. */
export function toShown(wallet: Shown, cents: number): number {
  return wallet.shownAsOwed ? flip(cents) : cents
}

/** The Amount to store for what was typed on this Wallet. The flip is its own inverse. */
export function fromShown(wallet: Shown, cents: number): number {
  return wallet.shownAsOwed ? flip(cents) : cents
}

/** An Amount as this Wallet displays it: "-$42.50", or "$1,250.00 owed" when shown as owed. */
export function formatShown(wallet: Shown, cents: number): string {
  const amount = format(toShown(wallet, cents))
  return wallet.shownAsOwed ? `${amount} owed` : amount
}

/** How far a Balance check is from its computed balance, signed as this Wallet shows Amounts. */
export function formatOffBy(wallet: Shown, cents: number): string {
  return `off by ${format(toShown(wallet, cents), { sign: "always" })}`
}
