---
"kabigting-apps": patch
---

Saving a Finances form straight after adding an Account or Category inline no longer fails: the save waits until the new name is stored. If the new name is refused, nothing is saved, the picker is cleared and the form stays open with what was typed.
