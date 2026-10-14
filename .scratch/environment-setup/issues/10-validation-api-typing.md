# Grill: Validation and API typing
Type: grilling
Status: resolved
Blocked by: 01

## Question

Decide Zod (or alternative) as shared validation, Hono RPC typed client usage, error shape conventions, and where shared types live.

## Answer

Decided with the user (all eight recommendations accepted).

- **Library:** Zod 4 with `@hono/zod-validator`. Pin the exact version at scaffold time after checking it under the TS 7 type-check.
- **Schemas:** hand-written Zod schemas in `src/shared/schemas/`, one file per App, types derived with `z.infer`. Not generated from Drizzle; `src/shared/` never imports Drizzle or anything server-only. Shared primitives in `src/shared/schemas/primitives.ts`: `cents` (safe integer), `isoDate` (`YYYY-MM-DD`), `instant` (ISO-8601 UTC), `id` (UUID). Each App schema builds on them.
- **Route types for the client:** one sanctioned exception to "the client never imports from the server": only `src/client/data/api.ts` may `import type` from the server's route module (type-only, so nothing server-side reaches the bundle). A lint rule enforces both directions (implemented in the lint ticket).
- **RPC scale:** one router module per App (`src/server/apps/<app>/routes.ts`), composed with `.route('/<app>', ...)`. The skeleton's `typecheck` script fails if `tsc` takes unreasonably long, to catch depth and performance problems early.
- **Errors:** custom envelope `{ "error": { "code", "message", "details"? } }`, not problem+json. A shared `ApiErrorCode` union in `src/shared/`: `unauthenticated` (401), `password_change_required` (403), `forbidden_app` (403), `validation_failed` (400, per-field issues in `details`), `not_found` (404), `conflict` (409), `internal` (500). One `app.onError` handler maps thrown errors to this shape.
- **`/query` envelope:** body is a shared base (optional `ids` UUID array capped at 5,000, `limit`, `after` cursor) plus a per-resource filter object; response is `{ "rows": [...] }` so `nextCursor` can be added later; Hono `bodyLimit` of a few hundred KB. The 5,000-ID cap is a sized guess (about 190 KB of JSON); revisit if real lists are longer.
- **Strictness:** inputs are `.strict()` (unknown keys rejected). No runtime parsing of responses in production; runtime response parsing runs in tests and development builds only, as a contract check.
- **Middleware:** `createAppRouter(appKey)` is the only way to create an App router. It applies, in fixed order: body limit, session required, `mustChangePassword` guard, `requireApp(appKey)`; each route then adds its own validator. The context carries a typed `account`.
