# Task: Write the Walking skeleton scaffold spec
Type: task
Status: resolved
Blocked by: none

## Question

Every decision ticket is resolved. Synthesize them into one scaffold spec, `.scratch/environment-setup/spec.md`, that a build agent can execute in one pass to produce the Walking skeleton (sign-in, forced password change, Shell, `skeleton_notes` round trip, installable PWA, deployed on Railway's generated domain). It must contain: the pinned version set; the file and folder layout; config files; each smoke test and verification the tickets deferred to scaffold time; the build order; the manual steps only the user can do (GitHub repo creation, Railway project and Postgres, domain, secrets, backups schedule, git author scrub); and nothing that is still undecided.

This is writing, not building: do not scaffold the project.

## Answer

Written to `.scratch/environment-setup/spec.md`: acceptance criteria, version pins, repository layout, configuration, database, shared code, server, client, tests, CI/CD and Railway, build order with checkpoints, the manual steps only the user can do, verification deferred from tickets, fallbacks and out-of-scope items. Nothing was scaffolded. The user reviews the spec before any build starts.
