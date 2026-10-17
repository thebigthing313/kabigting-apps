# kabigting-apps

## 0.3.0

### Minor Changes

- de44c70: The Admin now holds every App through the role. On the Accounts screen the Admin's row shows "All Apps" and its Edit Apps sheet has no App checkboxes, and setting Apps on the Admin is refused. App access rows the Admin had before are removed.
- ac73097: Inside an App, the sidebar now lists that App's sections under an App switcher for moving between Home and your Apps. Finances has Home, Schedules, Wallets and Summary sections, each a placeholder for now. Choosing a sidebar item on a phone closes the drawer, and an Account with no Apps sees "No Apps yet".
- 43f5505: Add Finances Accounts and Categories. A new Categories list (`/finances/categories`) shows every Category, marks archived ones, and offers Add and Unarchive. Account and Category pickers add a typed name inline and rename the picked entry; archived Categories stay out of the picker. Names are unique. The pickers appear in forms from later Finances releases.
- ec1a95f: Wallets take Balance checks. From a Wallet's Balance checks tab, enter the balance the bank shows on a date; on save you see the computed balance and how far off the bank's figure is, and nothing is adjusted automatically. A second check on the same date replaces the first. The list shows each check by date with "off by" when it differs, and the Wallets list and Wallet page now show the balance from the latest check. A Wallet with Balance checks can no longer be deleted; archive it instead.
- 45fa84b: Finances home now shows a Forecast for each Wallet in the forecast, one tab per Wallet. A Wallet's Forecast starts from its latest Balance check and shows today's balance, the low point and its date, a 30, 90, 180 or 365-day horizon (90 by default), a balance chart with the threshold and $0 lines, warnings for the first day under the threshold and the first day under $0, and a day-by-day list of end-of-day balances with each day's Schedule Occurrences. Overdue Occurrences dated after the latest Balance check count today and are marked Overdue, overridden and skipped Occurrences show as soon as they are saved, and a Transfer Schedule moves money out of one Wallet and into the other. A forecast Wallet with no Balance check shows a dashed "Enter balance" tab that opens the Balance check dialog.
- 85ad0a5: Each Schedule now has its own page, opened from the Schedules list. It lists the Schedule's Occurrences from the last 3 months to the next 6, with Overridden, Skipped and Overdue badges. Tap an Occurrence to give it a different amount or date, to Skip or Unskip it, or to put it "Back to schedule". Only that Occurrence changes; the rest of the Schedule keeps its terms, and a moved Occurrence still appears once, on its new date. On a card payment (a Transfer into a Wallet shown as owed), the fields read Statement balance and Due date. Amounts are entered as the Wallet shows them, and the Schedules list's next date and amount include these changes.
- 7c315c2: Replace the Notes sample App with an empty Finances App. Accounts with Finances access see a Finances home that says "Nothing here yet"; Notes and its data are removed.
- 17c94c8: Finances now has Schedules. Add one from the Schedules list: the Wallet it draws on, a Transaction (money in or out) or a Transfer to another Wallet, the Account, the Amount, every so many weeks or months from a start date, an optional end date, a Category (not for a Transfer) and a note. On a Wallet shown as owed, such as a card, the amount is entered as the Wallet shows it: a charge "Adds to what's owed". The list groups Schedules by Wallet and shows each one's Account or "Transfer to <Wallet>", its terms in words (such as "Monthly on the 31st" or "Every 2 weeks on Friday") and its next date and amount. A monthly Schedule on the 29th to 31st falls on the last day of shorter months, and dates never move for weekends.
- 7e225f4: Finances now has Wallets. Add a Wallet from the Wallets list, open it, and change its Settings: its name, whether it is in the forecast, its low-balance threshold, whether it is shown as owed (amounts are typed and shown as what you owe, as for a card), and archiving it. Archived Wallets hide behind a "Show archived" toggle. The Activity and Balance checks tabs are placeholders for now.

## 0.2.0

### Minor Changes

- d35f94e: Admin screen for managing Accounts and their App access.

## 0.1.0

### Minor Changes

- 23c303b: Walking skeleton: invite-only sign-in with a forced first password change, the Shell with an App switcher and light/dark/system themes, the sample Notes App saved through the client cache, and an installable PWA with update prompts.
