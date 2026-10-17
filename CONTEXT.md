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
The owner who creates Accounts, grants access, and issues the temporary password an Account must change at first sign-in. The Admin always has App access to every App.
_Avoid_: Superuser, owner

**Guest**:
An Account granted access to specific Apps only, such as a friend who is shared one App but not Finances.
_Avoid_: Friend, external user, collaborator

**App access**:
A grant letting one Account open one App and read and write all of that App's data, which is shared by everyone holding the grant; without it the App is hidden and refused. Revoking it leaves the Account able to sign in.
_Avoid_: Permission, entitlement

**Removed Account**:
An Account the Admin has blocked from signing in and signed out everywhere; its data is kept, and the Admin can restore it.
_Avoid_: Deleted, revoked, disabled

**Walking skeleton**:
The thinnest deployed end-to-end slice: sign in, read one record through the client cache from Postgres, installable on the Railway URL. Its sample App has since been replaced by Finances.
_Avoid_: Boilerplate, starter, MVP

**Amount**:
A signed money value in US cents: money out is negative, money in is positive, so a balance is a plain sum.
_Avoid_: Debit/credit pairs, unsigned amount plus type
