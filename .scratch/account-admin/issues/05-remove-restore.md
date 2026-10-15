# 05: Admin removes and restores an Account

**What to build:** In an Account's actions menu, the Admin chooses **Remove** and confirms "Sign {name} out everywhere and block sign-in? Their data is kept and you can restore them." The Account becomes a **Removed Account**: it can't sign in, it is signed out everywhere, and its stored temporary password is cleared. A Removed Account's menu offers **Restore**, which runs straight away (with a toast) and lets the Account sign in with its existing password. If a restored Account never changed its temporary password, its row shows "Reset to issue a new password" where the password would be. See spec section 3 and decisions D3, D5 and D13.

**Blocked by:** 03 (Admin creates an Account and sees its temporary password)

**Status:** ready-for-agent

- [ ] Remove bans the Account, deletes every session it has and clears its stored temporary password; removing it again changes nothing
- [ ] Restore unbans the Account without touching its password; restoring an Active Account changes nothing
- [ ] Both refuse the Admin's own Account (409) and an unknown id (404)
- [ ] Remove has a confirm dialog and Restore does not; both show pending states
- [ ] Integration tests: a Removed Account cannot sign in and has no sessions, a restored Account signs in with its old password, and both refusals hold
