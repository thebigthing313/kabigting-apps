# 06: Admin edits an Account's App access

**What to build:** In an Account's actions menu, the Admin opens **Edit Apps**: a sheet with one checkbox per App, a Save button and a Cancel button. Save sends the full set in one request: ticked Apps are granted and unticked ones revoked. Revoking an App doesn't sign the Account out. Its next request to that App is refused, and the App disappears from its Shell. An Account left with no Apps stays signed in to an empty Home. See spec decisions D3, D5 and D12.

**Blocked by:** 02 (Admin sees the Accounts list)

**Status:** ready-for-agent

**Issue:** #12

- [ ] Saving replaces the Account's App access with the given set in a single transaction
- [ ] An unknown App key returns 400, the Admin's own Account returns 409 and an unknown id returns 404
- [ ] An Edit Apps sheet with checkboxes from the shared App registry; Save shows a pending state and Cancel discards the changes
- [ ] Integration tests: granting and revoking work, a revoked App's routes return `forbidden_app` to that Account, and the refusals above hold
- [ ] e2e (extend 03's spec if it has landed, otherwise create the Account in this test): the Admin unticks Notes, and the Account's Home then shows no Apps
