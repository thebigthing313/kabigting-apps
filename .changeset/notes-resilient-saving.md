---
"kabigting-apps": patch
---

Typing in Notes now survives a flaky network and leaving the page. If a save can't reach the server, the text stays in its field marked "Not saved", and it is tried again when you type, return to the app or reconnect; the marker clears once it saves. Leaving a Note, switching apps or tabs, or closing the page sends any typing still waiting to save at once, and nothing asks you to confirm leaving. Nothing is kept on the device: a reload shows the Note as last saved.
