# Each Note is visible only to its creator and Audience

Every other App shares all its data with everyone holding App access, but Notes narrows that per
record: a Note is seen and edited only by its creator and the Accounts in its Audience, and only the
creator changes the Audience or deletes the Note. App access stays the outer gate, so an Account must
hold both. The Admin gets no bypass, because private notes must stay private even in a household
where the Admin runs the Shell.

## Considered Options

- **Admin bypass**: rejected; it would make "private" mean "private except from the Admin".
- **Dropping Audience rows when App access is revoked or an Account is removed**: rejected; the rows
  stay and the App access check hides them, so restoring access or the Account brings the Notes back.
  The Audience editor still lists such Accounts, marked as without access.
- **Transferring ownership when the creator loses access**: rejected for now; the Audience keeps
  reading and editing, and only Audience changes and deletion wait for the creator's return.
- **Postgres row-level security**: rejected for now in favour of one server-side visibility filter
  applied to every Notes query.
