---
"kabigting-apps": patch
---

Typing in Notes now survives a flaky network and leaving the page. If a title, a body or a Checklist Item can't reach the server, including while the server is restarting, the text stays where you typed it, marked "Not saved". It is tried again when you type, return to the app or reconnect, and the marker clears once it saves. Leaving a Note, switching apps or tabs, or closing the page sends everything still waiting to save at once, including text left in the "Add item" row, and nothing asks you to confirm leaving. Nothing is kept on the device: a reload shows the Note as last saved.
