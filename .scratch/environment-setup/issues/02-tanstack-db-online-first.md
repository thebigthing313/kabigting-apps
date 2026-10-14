# Research: TanStack DB for an online-first app
Type: research
Status: resolved
Blocked by: none

## Question

What is TanStack DB's current maturity and API? What are the collection/sync options for an online-first app with Hono + Postgres (query collection over REST/RPC vs Electric or other sync engines), including mutations, optimistic updates, and persistence? Which options run cleanly on a single Railway service?

## Answer

Findings are on branch `research/tanstack-db-online-first`, file `.scratch/environment-setup/research/02-tanstack-db-online-first.md`. Agent output, versions checked via npm on 2026-10-14; not yet reviewed by the user.

- TanStack DB is beta and pre-1.0 (`@tanstack/db` 0.14.0, `react-db` 0.5.9, `query-db-collection` 1.4.4, `electric-db-collection` 0.6.0). It releases near-daily, so pin exact versions. Docs flag upcoming breaking changes (auto-refetch removal, `isPersisted` deprecation).
- Recommended: an eager Query Collection (`@tanstack/query-db-collection`) over plain Hono REST endpoints. It fits one Railway service and same-origin Better Auth cookies. Mutation handlers return the written row and call `writeUpsert` (or return `{refetch:false}`), rolling back on throw.
- Electric Collection is the only real Postgres sync option, but needs a second Railway service with a volume, logical replication on a direct connection, an auth proxy and txid matching. Whether stock Railway Postgres allows logical replication is unconfirmed. Defer it.
- Local persistence (OPFS SQLite) and offline transactions are optional and unnecessary for online-first; list them as revisit triggers.
- Not verified: React Compiler compatibility and TypeScript 7 (peer dependency is only `>=4.7`). Both need a smoke test in the skeleton.
