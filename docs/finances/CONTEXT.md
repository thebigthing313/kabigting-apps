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
other Friday. An Account may have several Schedules or none.
_Avoid_: Recurring, bill, Expense, Income

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
