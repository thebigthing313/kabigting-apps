# 04: Admin resets an Account's password

**What to build:** In an Account's actions menu, the Admin chooses **Reset password** and confirms "Sign {name} out everywhere and issue a new temporary password?" The new temporary password then appears in the same result view used for creation. The Account is signed out everywhere and must change the password at its next sign-in. Until it does, its row shows the new password. This takes the place of a forgotten-password flow. See spec decisions D5 and D13.

**Blocked by:** 03 (Admin creates an Account and sees its temporary password)

**Status:** ready-for-agent

- [ ] Resetting issues a new password, sets the forced change, deletes every session the Account has and stores the new password
- [ ] Resetting the Admin's own Account returns 409 `conflict` ("You cannot change your own Account here"), and an unknown id returns 404
- [ ] A confirm dialog, a pending state, then the result view with Show and Copy
- [ ] Integration tests: the old password stops working, the Account's sessions are gone, the list shows the new password, and a reset of the Admin's own Account or an unknown id is refused
