# Kabigting Apps

A single installable web app (PWA) that hosts a family's personal apps behind one sign-in. The first app is the family finances manager.

## Language

**Shell**:
The one PWA that is installed and signed into; it hosts every App as a route subtree.
_Avoid_: Portal, platform, host

**App**:
A self-contained feature area living inside the Shell (e.g. Finances), with its own routes and data.
_Avoid_: Module, plugin, product

**Account**:
A person's sign-in identity, created only by the Admin; there is no self-signup.
_Avoid_: User, profile, member

**Admin**:
The owner who creates Accounts, grants access, and issues the temporary password an Account must change at first sign-in.
_Avoid_: Superuser, owner

**Walking skeleton**:
The thinnest deployed end-to-end slice: sign in, read one record through the client cache from Postgres, installable on the Railway URL.
_Avoid_: Boilerplate, starter, MVP
