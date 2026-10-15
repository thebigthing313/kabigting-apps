# 01: One App registry shared by server and client

**What to build:** A prefactor with no change in behaviour. Each App's key and title is defined once in shared code. The server's list of App keys (used by App access, App routers and the admin CLI) and the client's App entries (description, route, icon) both derive from it. That lets the admin screen show App titles next to server keys, and an App added without its client entry fails the type check. See spec D14.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] App keys and titles are declared once in shared code, and the server and client registries derive from it
- [ ] A shared App key without a client entry is a type error
- [ ] The Shell sidebar, Home launcher, App access check and admin CLI behave exactly as before
- [ ] `pnpm check` and `pnpm test:all` pass
