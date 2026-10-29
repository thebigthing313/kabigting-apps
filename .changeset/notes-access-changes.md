---
"kabigting-apps": minor
---

A Note's Audience now survives App access changes. Someone who loses access to Notes, or whose Account is removed, stays in the Audience of every Note shared with them, so those Notes come back, as they left them, when their access returns. The creator's Share sheet still lists them, marked "no access", and can take them off, but can't add them back until their access returns. A Note whose creator loses access stays readable and editable by its Audience; nobody can delete it or change who sees it until the creator is back, the Admin included. Better Auth's own admin endpoints, such as impersonating an Account, are closed over HTTP; the Admin manages Accounts from the Accounts screen only.
