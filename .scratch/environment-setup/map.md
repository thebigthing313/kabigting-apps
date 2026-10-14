# Map: kabigting-apps environment setup

## Destination

A locked set of stack decisions plus a scaffold spec a build agent can execute in one pass to produce the **Walking skeleton**, deployed as a PWA on Railway's generated domain. Nothing is left to decide before building. The finances app port is not part of this map.

## Notes

- Planning only: tickets resolve decisions; nothing is scaffolded until the map is done.
- Settled while charting (no ticket needed):
  - Must-haves: Postgres, React Compiler, TypeScript 7, TanStack Router, TanStack DB (client cache), Hono (API), Better Auth, Vite, shadcn.
  - Online-first. The PWA installs and caches the Shell; data is not queued offline. TanStack DB is a fast client cache that revalidates from the server.
  - One Railway service: Hono serves `/api/*` and the built SPA from the same origin, with Railway Postgres beside it. Vite dev proxies `/api`. (Proposed during charting, not contradicted.)
  - Single package with feature folders per App; no workspace until a second deployable exists. (Proposed, not contradicted.)
  - No household concept. The Admin provisions Accounts by email with a forced password change at first sign-in. Apps may later be shared with friends.
  - Railway-generated domain only; no custom domain.
- Stack gaps raised and accepted: ORM/migrations, validation + API typing, Tailwind, PWA tooling, lint/format, testing, money/dates, CI/CD + envs + secrets, backups, toolchain pinning.
- Skills: `grilling` + `domain-modeling` for grilling tickets; keep `CONTEXT.md` a glossary only.
- Tracker: local markdown in `.scratch/environment-setup/`.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

## Not yet specified

- **Scaffold spec / hand-off.** Turn all decisions into the Walking skeleton build spec. Graduates once the grilling tickets close.
- **Friend sharing.** How an App is shared with non-family Accounts (per-App access?). Depends on the auth provisioning model.
- **Transactional email.** Password reset and invites need an email sender if temporary passwords aren't enough. Depends on the auth provisioning model.
- **Observability.** Error tracking and logs on Railway. Depends on the deployment research.

## Out of scope

- Porting the finances app itself (starts after this map).
- Custom domain.
- Offline writes and conflict resolution (online-first was chosen).
- Multi-household / tenancy.
