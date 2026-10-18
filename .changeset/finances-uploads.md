---
"kabigting-apps": minor
---

Upload bank and card statement files. The + button's new Upload file takes an `.ofx`, `.qfx` or `.qbo` download of up to 5 MB. The first file from a bank account asks which Wallet it belongs to (shown by its last four digits), and the Wallet remembers it, so later files go straight there. Its lines become Actuals, with amounts signed as the bank gives them, and the result reads "N added, M already here": uploading the same file again adds nothing. An uploaded Actual keeps the bank's amount, date and Wallet, but its Category, Account and note can change. Deleting one ignores it, so later uploads skip it, and the Wallet's Activity has an Ignored lines list where it can be restored. Only a hash and the last four digits of a bank account are stored.
