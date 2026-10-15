# 02: Admin sees the Accounts list

**What to build:** The Admin gets an **Admin → Accounts** item in the Shell sidebar. It opens a read-only list of every Account: email, name, status (**Active**, **Awaiting password change**, **Removed**) and App chips, with a "You" badge on the Admin's own row. The layout is mobile-first: stacked cards below `md`, a table above. Without the `admin` role, no Account sees the item or the screen, and the server enforces this. See spec sections 1, 4 and 5 and decisions D2, D7, D8, D9 and D11.

**Blocked by:** 01 (One App registry shared by server and client)

**Status:** ready-for-agent

- [ ] A new error code, `forbidden_admin` (403), and an Admin guard that runs after the session check and the forced-password-change check
- [ ] Listing the Accounts returns each one's id, email, name, role, status flags and Apps, ordered by email
- [ ] A non-Admin gets 403 `forbidden_admin`, a signed-out caller gets 401, and an Admin who must change their password gets 403 `password_change_required`
- [ ] The client route sends non-Admins to Home, and only the Admin sees the sidebar item
- [ ] Client data uses plain TanStack Query, not a TanStack DB collection
- [ ] Integration tests cover the list and every refusal above
- [ ] A changeset (minor): "Admin screen for managing Accounts and their App access."
