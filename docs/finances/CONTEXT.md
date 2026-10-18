# Finances

The household finances App: what money is planned to move, what actually moved, and where it sits.
Amounts follow the Shell glossary: signed US cents, money out negative.

## Language

**Account**:
Someone money is paid to or received from that the household plans around, such as a landlord, a
utility or an employer. Not a sign-in; in the Shell context that word means an identity.
_Avoid_: Payee, biller, merchant, Expense, Income

**Wallet**:
A place money is held, such as checking, a credit card or cash.
_Avoid_: Account, bank account, source

**Transaction**:
A row of money in or out of one Wallet, either Planned or Actual. It may name an Account and a
Category; neither is required.
_Avoid_: Entry, item, record

**Planned**:
A Transaction or Transfer that has not happened yet, made by a Schedule or entered by hand as a
one-off.
_Avoid_: Pending (a bank's pending means a real swipe not yet posted), expected, forecast

**Actual**:
A Transaction or Transfer that really happened.
_Avoid_: Posted, cleared, real

**Schedule**:
A recurrence that makes Planned Transactions or Transfers, such as rent on the 1st or pay every
other Friday. It repeats every so many weeks or months from its start date until an optional end
date. An Account may have several Schedules or none.
_Avoid_: Recurring, bill, Expense, Income

**Occurrence**:
One date a Schedule falls on, known by its Schedule and that nominal date. It shows up as a Planned
Transaction or Transfer, which can be given its own amount or date, or skipped, without changing
the rest of the Schedule.
_Avoid_: Instance, installment, entry

**Transfer**:
Money moved between two of the household's Wallets, such as paying a credit card from checking. It
is not a Transaction and has no Category, so it never counts as spending or income.
_Avoid_: Payment, credit card payment Transaction

**Category**:
A reporting label that groups Transactions to show where money goes, such as Groceries or Housing.
It drives no behaviour.
_Avoid_: Type, payee type, budget

**Balance check**:
A Wallet's actual balance on a date, as entered from the bank.
_Avoid_: Snapshot, statement, starting balance

**Reconcile**:
Pairing one Actual with the one Planned Transaction or Transfer it fulfils, suggested by the app
and confirmed by a person. The Actual's amount and date are the truth; the Planned one leaves the
Forecast, and Un-Reconcile puts it back at its own amount. An Actual Reconciled to nothing is
unplanned, which is a normal end state.
_Avoid_: Match, clear, link

**To review**:
The uploaded Actuals waiting for a person because the app has a suggestion for them: a Planned
item to Reconcile to, a hand-entered Actual the line repeats (its hand-entry twin), or an Actual
Transfer whose other side the line is. Each is confirmed, Reconciled to another Planned item, or
called unplanned. Uploaded lines with nothing to suggest are unplanned at once, and hand-entered
Actuals never wait here.
_Avoid_: Inbox, pending, unmatched

**Overdue**:
A Planned Transaction or Transfer whose date has passed and that is not yet Reconciled or skipped.
The Forecast counts it today until it is, except one dated on or before the Wallet's
latest Balance check, which that check is taken to include already.
_Avoid_: Late, missed, past due

**Forecast**:
One Wallet's projected end-of-day balance for each day from today, starting from its latest
Balance check and adding what is still Planned. A Wallet has one only when it is in the forecast
and has a Balance check; there is no combined total.
_Avoid_: Projection, budget, cash flow
