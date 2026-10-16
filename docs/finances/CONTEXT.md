# Finances

The household finances App: what money is planned to move, what actually moved, and where it sits.
Amounts follow the Shell glossary: signed US cents, money out negative.

## Language

**Account**:
Someone money is paid to or received from that the household plans around, such as a landlord, a
utility or an employer. Not a sign-in; in the Shell context that word means an identity.
_Avoid_: Payee, biller, merchant, Expense, Income

**Wallet**:
A place money is held, such as checking, a credit card or cash. Wallets have no kinds: a credit card
is a Wallet whose balance is usually negative, the amount owed.
_Avoid_: Account, bank account, source, card account

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

**Reconcile**:
To confirm that one Actual is the one Planned Transaction or Transfer it fulfils. It is always one
to one and always confirmed by a person. The Actual's amount and date are the truth from then on.
_Avoid_: Clear, match up, settle

**Overdue**:
A Planned Transaction or Transfer whose date has passed with nothing Reconciled to it. It is still
expected until it is Reconciled, moved or skipped.
_Avoid_: Missed, expired, late

**Transfer**:
Money moved between two of the household's Wallets, such as paying a credit card from checking. It
is not a Transaction and has no Category, so it never counts as spending or income. One Transfer
covers both Wallets: the bank lines for its two sides are both matched to it.
_Avoid_: Payment, credit card payment Transaction

**Category**:
A reporting label that groups Transactions to show where money goes, such as Groceries or Housing.
It drives no behaviour. The list is flat, a Transaction has at most one, and a Category has no
direction: a refund nets against spending in its own Category. A Schedule's Category is only a
default for the Planned Transactions it makes. A retired Category is archived, or merged into
another.
_Avoid_: Type, payee type, budget, subcategory

**Monthly summary**:
Actual Transactions in every Wallet for one calendar month, totalled per Category (with an
Uncategorised row) and as income, spending and net, each set beside the previous month and the
trailing 12-month average. Transfers and Planned Transactions are not in it.
_Avoid_: Budget, report, spending breakdown

**Balance check**:
A Wallet's actual posted balance at the end of a date, as entered from the bank. Actuals dated on or
before that date are already in it. A Wallet has at most one per date; a later entry replaces it.
_Avoid_: Snapshot, statement, starting balance, available balance

**Forecast**:
A Wallet's projected end-of-day balance for each day ahead: its latest Balance check, plus the
Actuals since, plus every outstanding Planned Transaction and Transfer, with Overdue ones counted
today. Only Wallets marked as in the forecast have one.
_Avoid_: Projection, budget, cash flow
