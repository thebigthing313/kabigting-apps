/**
 * A Wallet "shown as owed", such as a credit card, holds a negative balance but is read and typed
 * as a positive amount owed. Only entry and display flip; stored Amounts keep their real sign.
 */
type Shown = { shownAsOwed: boolean }

function flip(cents: number): number {
  return cents === 0 ? 0 : -cents
}

/** The Amount as this Wallet displays it. */
export function toShown(wallet: Shown, cents: number): number {
  return wallet.shownAsOwed ? flip(cents) : cents
}

/** The Amount to store for what was typed on this Wallet. */
export function fromShown(wallet: Shown, cents: number): number {
  return wallet.shownAsOwed ? flip(cents) : cents
}
