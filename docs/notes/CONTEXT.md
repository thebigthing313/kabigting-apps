# Notes

The Notes App: short shared notes, either free text or a checklist, each seen only by the Accounts
its creator chooses.

## Language

**Note**:
One record in the Notes App, either a Text note or a Checklist, with an optional one-line title. Its
kind is fixed when it is made and never changes.
_Avoid_: Memo, document, entry

**Text note**:
A Note whose body is plain text, kept and shown exactly as typed.
_Avoid_: Plain note, text

**Checklist**:
A Note holding a flat, ordered set of Items and nothing else besides its title.
_Avoid_: List, to-do, task list

**Creator**:
The Account that made a Note. It never changes.
_Avoid_: Owner, author

**Audience**:
The Accounts, besides its creator, that a Note is shared with; any of them can read and edit it, and
only the creator changes who is in it. Losing App access to Notes, or becoming a Removed Account,
leaves an Account in its Audiences, so their Notes return with the access.
_Avoid_: Sharers, collaborators, members

**Unopened**:
A Note an Account in its Audience has not opened since it was last added to that Audience. Unopened
Notes come first in that Account's list. Its creator never sees a Note as Unopened.
_Avoid_: Unread, new, unseen

**Item**:
One line of plain text in a Checklist, either checked or unchecked. Items never nest. Checked Items
sit together below the unchecked ones, the most recently checked first; unchecking an Item returns it to the bottom of the unchecked
Items.
_Avoid_: Task, to-do, entry, row
