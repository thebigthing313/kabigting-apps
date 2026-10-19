# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root: it points at one `CONTEXT.md` per context. Read each one
  relevant to the topic. Today that is `CONTEXT.md` (the Shell) and `docs/finances/CONTEXT.md` (the
  Finances App).
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. Also check
  `docs/<app>/adr/` for decisions scoped to one App.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is multi-context: the Shell has the root glossary and each App keeps its own under
`docs/<app>/`, not under `src/`.

```
/
├── CONTEXT-MAP.md
├── CONTEXT.md                         ← the Shell
├── docs/
│   ├── adr/                           ← system-wide decisions
│   └── finances/
│       ├── CONTEXT.md                 ← the Finances App
│       └── adr/                       ← Finances-only decisions
└── src/
```

A new App's glossary goes at `docs/<app>/CONTEXT.md`, listed in `CONTEXT-MAP.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

A term means what its own context's glossary says. In the Finances App, **Account** means a payee
or income source, not a sign-in as in the Shell.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
