# Split

The household's shared-expense App: who paid for what, who owes for it, and how each Member stands.
Money is integer US cents, but an Expense's total is not a Shell Amount, where money out is
negative: it is positive for a cost and negative for a Refund. Its Paid and Owed shares carry the
same sign as its total. A Balance is positive when the others owe a Member, and a Payment is
always positive.

## Language

### People

**Member**:
The Admin, or an Account holding App access to Split. Every Member belongs to the one household;
there are no groups.
_Avoid_: User, participant, friend, person

**Former member**:
An Account that Split's money names, on a share, a side of an Expense or a Payment, but that has
lost App access or become a Removed Account. It keeps a Balance and its existing shares, can still
send or receive Payments, and is never added to new Expenses. An Account named only as who added or
changed an entry is not one: Split shows its name there and nowhere else.
_Avoid_: Inactive member, deleted member

### Money

**Expense**:
One shared cost entered once, with a total, a date, a description, a Category and an optional note,
made of Paid shares and Owed shares that each sum to the total. A negative total is a Refund.
_Avoid_: Bill, Transaction, split (as a noun)

**Refund**:
An Expense with a negative total: money given back, where the paid side is who got it back and the
owed side is who shares in it.
_Avoid_: Credit, reversal, negative Expense

**Paid share**:
The part of an Expense's total one Member put in.
_Avoid_: Contribution, payer amount

**Owed share**:
The part of an Expense's total one Member carries.
_Avoid_: Split, portion, debt

**Split mode**:
How one side of an Expense is divided among its Members: exact dollars, percent of the total, or
equally among the Members ticked. The paid side and the owed side each have one, which may differ.
_Avoid_: Split type, method

**Payment**:
Money one Member hands another, whether to settle up or as a loan: a positive Amount from one
Member to a different one, with an optional note. Unlike in Finances, where money between Wallets
is a Transfer, here a Payment is between people.
_Avoid_: Settle-up, reimbursement, loan, Transfer

**Balance**:
A Member's one overall standing: their Paid shares, less their Owed shares, plus the Payments they
sent, less the Payments they received. Positive means the others owe them; negative means they owe.
There is no Balance between two particular Members.
_Avoid_: Debt, net, who-owes-whom

### Labels

**Category**:
A flat, shared label every Expense carries, Refunds included, with General preselected. Any Member
can add, rename or archive one; an archived Category stays on its Expenses but isn't offered on new
ones, and none is ever deleted. Payments have none. It is not a Finances Category.
_Avoid_: Tag, type, group
