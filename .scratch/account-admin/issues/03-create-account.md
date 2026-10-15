# 03: Admin creates an Account and sees its temporary password

**What to build:** On the Accounts screen, the Admin creates an Account from an email, a name and a set of Apps. The result view shows the temporary password, masked, with Show and Copy, and the line "Send this to them yourself. They must change it when they first sign in." The same password stays viewable on the Account's row while it is **Awaiting password change**, and disappears for good once the Account changes it. See spec section 3 (password storage) and decisions D9 and D10.

**Blocked by:** 02 (Admin sees the Accounts list)

**Status:** ready-for-agent

**Issue:** #9

- [ ] A new table owned by the app holds at most one temporary password per Account and never feeds the session payload, with a committed, forward-only migration
- [ ] Creating an Account (from the UI or the CLI) stores the password, and the Account's own password change deletes it
- [ ] Creating an Account validates strictly (email trimmed and lowercased, name 1–100 characters, known App keys only) and returns the row with the password
- [ ] A duplicate email returns 409 `conflict`, and an unknown App key returns 400
- [ ] A New Account dialog with email, name and App checkboxes (all unticked), a pending state, then the result view
- [ ] Rows that are Awaiting password change show the masked password with Show and Copy (Copy shows a "Copied" toast)
- [ ] Integration tests: create an Account, the list shows its password, and signing in and changing the password clears both the flag and the stored password
- [ ] e2e: the Admin creates an Account with Notes, reads the password with Show and signs out; the new Account signs in, is forced to change the password, and sees Notes on Home
- [ ] The admin CLI's header comment no longer says there is no admin screen, and its integration test stays green
