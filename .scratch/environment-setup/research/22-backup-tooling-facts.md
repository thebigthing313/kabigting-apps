# 22 - Backup tooling facts (Railway Postgres 18, off-platform encrypted backups)

Researched 2026-10-14. Legend: **[P]** = stated by a primary source (linked), **[I]** = inference/judgement by the researcher, **[GAP]** = primary source is silent. Railway docs were read as raw markdown (`https://docs.railway.com/<path>.md`).

## TL;DR

1. Railway volume backups are copy-on-write snapshots of the volume. Docs never say "crash-consistent" and never mention `pg_dump` [GAP]. Postgres's own docs say a running-server snapshot is recoverable via WAL replay (crash-style recovery) [P]; applying that to Railway is [I]. Railway's newer PITR (pgBackRest to a Railway bucket) is a separate, better-documented path [P].
2. Railway cron: set in service Settings; 5-field UTC crontab; min 5 min apart; an overlapping run is skipped; no documented max runtime; failure notification only via project webhooks (Slack/Discord URLs auto-handled). **`.railway/railway.ts` documents NO cron/schedule option** [P: absence in the reference]; `cronSchedule` exists only in deprecated `railway.json/toml`, which stops being read 2026-12-01 [P].
3. Railway Buckets: $0.015/GB-month, free ops, free bucket egress, public network only, no automatic backups, no versioning/object-lock/lifecycle; but they live on the same platform, so not independent of Railway. R2: 10 GB free, free egress, lifecycle expiry. B2: 10 GB free, egress free up to 3x stored, lifecycle rules.
4. Use `pg_dump` 18 (client must be >= server major) in custom format (`-Fc`), restored with `pg_restore` 18. Get the client via PGDG apt (`postgresql-client-18`) in a Dockerfile; Railpack apt vars only take package names and do not document adding a repo.
5. `age` (X25519 recipient, public key in CI/Railway, private key offline) fits; JS library is `age-encryption` on npm.
6. GitHub: logs on public repos need a GitHub login but are visible to any logged-in user [P + I]; artifacts need "read access", which on a public repo is everyone logged in [I, not stated verbatim]. Treat both as public. A scheduled workflow over the public TCP proxy is workable only with client-side `age` encryption; scheduled workflows auto-disable after 60 days without repo activity on public repos [P].

---

## 1. Railway volume backups for Postgres

**[P]** Backups cover all volume contents, "including Railway's database offerings and any other data stored within a volume, such as an SQLite database." Manual, plus Daily (every 24h, kept 6 days), Weekly (7d, kept 27 days), Monthly (30d, kept 89 days); multiple schedules allowed. Source: <https://docs.railway.com/volumes/backups>

**[P]** Cost: "Backups are incremental and Copy-on-Write, we only charge for the data exclusive to them"; billed per GB per minute at Volumes pricing. Volume storage is $0.15/GB/month; egress $0.05/GB; Hobby $5/mo (includes $5 usage), Pro $20/mo. Sources: same backups page; <https://docs.railway.com/reference/pricing/plans>

**[P]** Limits/caveats: manual backups limited to 50% of volume size; wiping a volume deletes all its backups; restore only into the same project + environment; page calls backups "a newer feature that is still under development."

**[P]** Restore procedure: Backups tab -> Restore on the dated backup -> a new volume (named by the backup's date stamp) is staged, mounted at the same path; original volume stays, unmounted; review under Details; click Deploy to apply and redeploy. Newer backups remain on the old volume.

**Crash-consistency: [GAP]** The Railway backups page does not say whether a snapshot is crash-consistent, application-consistent, or quiesced, and has no pg_dump guidance. The Railway Postgres page only says regular backups are essential and points to native volume Backups. Source: <https://docs.railway.com/databases/postgresql>

**[P] Postgres's own position on snapshots:** a filesystem "consistent snapshot" taken while the server runs "saves the database files in a state as if the database server was not properly shut down; therefore, when you start the database server on the backed-up data, it will think the previous server instance crashed and will replay the WAL log. This is not a problem". It requires a snapshot of the whole data directory (including WAL). Source: <https://www.postgresql.org/docs/18/backup-file.html>
**[I]** If Railway's snapshot is atomic at volume level (copy-on-write suggests it), a restore is equivalent to crash recovery and should work, but Railway does not promise it. Treat volume backups as crash-consistent-at-best and verify a restore yourself.

**Railway-native alternative [P]:** Point-in-Time Recovery for Postgres uses pgBackRest, archiving WAL continuously to a Railway Storage Bucket, weekly full + daily differential base backups, last 4 fulls kept (~4 weeks). Restore creates a new sibling service; source untouched. Cost = bucket storage + service egress for uploads, no separate fee. Requires the official `ghcr.io/railwayapp-templates/postgres-ssl` image on a major tag and no custom start command. CLI: `railway postgres pitr ...`. Sources: <https://docs.railway.com/volumes/point-in-time-recovery>, <https://docs.railway.com/cli/postgres>. This is still on-platform, so it does not meet the "independent off-platform" goal.

**pg_dump vs volume backups:** postgresql.org says pg_dump "makes consistent exports even if the database is being used concurrently" and does not block readers/writers, but also "except in simple cases, pg_dump is generally not the right choice for taking regular backups of production databases" (no PITR). Source: <https://www.postgresql.org/docs/18/app-pgdump.html>. **[I]** For a tiny family finance DB a daily logical dump is appropriate and is portable across hosts and major versions, which a volume snapshot is not.

## 2. Railway cron services

- **Define [P]:** Service -> Settings -> "Cron Schedule", 5-field crontab. Railway runs the service's **start command** on schedule; the process must do its work and exit, closing DB connections. Source: <https://docs.railway.com/cron-jobs>
- **UTC [P]; min interval 5 minutes [P]** (also across hour boundaries); timing "can vary by a few minutes."
- **Overlap [P]:** Railway does not terminate deployments; if the previous run is still `Active`, the new run is skipped. `railway cron list` shows `previous run still running` for skipped runs, plus status/duration per run. Source: <https://docs.railway.com/cli/cron>
- **Run time limit: [GAP]** No maximum duration documented on the cron page. It names "a daily database backup" as a good fit.
- **Failure behaviour:** the cron page is silent [GAP]. The restart policy page says the default is `On Failure`, max 10 restarts, triggered when a service "exits with a non-zero exit code" ([P] <https://docs.railway.com/deployments/restart-policy>). **[I]** For a cron service consider `Never`, since the docs don't say how restart policy interacts with cron runs.
- **Notifications [P]:** no per-cron email. Project Webhooks (Settings -> Webhooks) fire on deployment status changes including `Failed`/`Crashed`; Slack and Discord webhook URLs are auto-adapted. Email exists only via Monitors (CPU/RAM/disk/egress) and requires Pro. Sources: <https://docs.railway.com/guides/alerts-crashes-failed-deploys>, <https://docs.railway.com/observability/webhooks>. **[I]** A job that exits 0 but produced a bad/empty backup is invisible to Railway; add an external dead-man's-switch ping or a freshness check on the bucket.
- **`.railway/railway.ts` [P by absence]:** TypeScript GA, Python/Go beta. `service()` options seen in the reference: `source`, `build`, `start`, `healthcheck`, `healthcheckTimeout`, `preDeploy`, `replicas`, `tracing`, `env`, `domains`, `volumeMounts`. **No cron/schedule option appears** in the IaC overview or reference (grepped raw markdown of both: zero hits for "cron"/"schedule"). Sources: <https://docs.railway.com/infrastructure-as-code>, <https://docs.railway.com/infrastructure-as-code/reference>. The only documented file-based key is `deploy.cronSchedule` in `railway.json/toml` (<https://docs.railway.com/reference/config-as-code>), and Config as Code is deprecated: "Existing Config as Code files stop being read on **2026-12-01** (hard cutoff)"; a service cannot be managed by both. **[I]** Set the cron schedule in the dashboard and re-check the IaC reference before relying on railway.ts for it. `railway.ts` can declare `postgres()` and `bucket(name, {region})`.
- **Private network [P]:** services in the same project+environment reach each other at `<SERVICE_NAME>.railway.internal`. The Postgres service exposes `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `DATABASE_URL` for reference from other services; public access (TCP proxy, `DATABASE_PUBLIC_URL`) is opt-in and billed as egress. Sources: <https://docs.railway.com/networking/private-networking>, <https://docs.railway.com/databases/postgresql>. **[I]** A cron service in the same project can use the private `DATABASE_URL`. Buckets are public-network only, so the upload leg is billed as service egress ($0.05/GB; negligible for a small dump).

## 3. Storage: Railway Buckets vs Cloudflare R2 vs Backblaze B2

| | Railway Buckets | Cloudflare R2 | Backblaze B2 |
|---|---|---|---|
| Storage | $0.015/GB-mo, rounded up to whole GB-month [P] | $0.015/GB-mo Standard [P] | from $6.95/TB/mo [P] |
| Free tier | Free plan up to 10 GB-mo counted against $1 credit; access suspended when credit exhausted [P]. Not in Limited Trial [P] | 10 GB-mo, 1M Class A, 10M Class B per month (Standard only) [P] | first 10 GB free [P] |
| Egress | bucket egress free [P]; uploads from a Railway service billed as service egress [P] | free [P] | free up to 3x avg stored; then $0.01/GB [P] |
| Ops | free, unlimited [P] | free tier then metered [P] | Class A/B/C free; Class D $0.004/10k [P] |
| Durability | no numeric claim; runs on Tigris; encrypted at rest [P] | "eleven 9s" annual durability, 99.9% availability SLA [P] | 11 nines (Vault, 17+3 shards) [P]; 99.9% availability only from blog/product pages |
| Backup/lifecycle | "doesn't currently offer automatic backups or snapshots"; no versioning, object lock, lifecycle config or SSE; deleted bucket restorable 52 h [P] | lifecycle expiry after N days supported [P] | lifecycle rules (hide/delete after N days); Object Lock blocks deletion [P] |
| Network | public only [P] | public | public |

Sources: <https://docs.railway.com/storage-buckets>, <https://docs.railway.com/storage-buckets/billing>, <https://developers.cloudflare.com/r2/pricing/>, <https://developers.cloudflare.com/r2/reference/durability/>, <https://developers.cloudflare.com/r2/buckets/object-lifecycles/>, <https://www.backblaze.com/cloud-storage/pricing>, <https://www.backblaze.com/docs/cloud-storage-resiliency-durability-and-availability>, <https://www.backblaze.com/docs/cloud-storage-lifecycle-rules>.

Availability of Railway Buckets: documented and creatable now (no beta label on the page; formal GA status [GAP]); region chosen at creation and immutable; Hobby combined cap 1 TB. **[I]** A Railway bucket is not "independent off-platform": an account/billing suspension affects both DB and backup (Free-plan buckets suspend when credits run out; a hard usage limit also suspends buckets). For independence pick R2 or B2. 10 GB free is far above a family-finance dump (likely well under 100 MB each); 30-90 daily dumps fit. R2/B2 signup payment-method requirements were not checked [GAP]. **[I]** R2 has the simplest model (free egress, S3 API, lifecycle expiry); B2 is equally viable.

## 4. pg_dump 18 inside a Railway-built container

- **Version rule [P]:** "pg_dump cannot dump from PostgreSQL servers newer than its own major version; it will refuse to even try"; output loads into newer servers, not guaranteed into older. Client must be **18+** for a Postgres 18 server. Source: <https://www.postgresql.org/docs/18/app-pgdump.html>
- **Getting the 18 client [P]:** PGDG apt repo supports Debian trixie and bookworm (amd64/arm64). Script route: `apt install postgresql-common`, run `/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh`, then `apt install postgresql-client-18`. Manual route: key `https://www.postgresql.org/media/keys/ACCC4CF8.asc` plus a `pgdg.sources` entry with suite `<codename>-pgdg`. Source: <https://www.postgresql.org/download/linux/debian/>
- **Dockerfile [I, recommended]:** `FROM postgres:18` (official image; tags `18`, `18-trixie`, `18.6` exist per <https://hub.docker.com/_/postgres>) already contains `pg_dump`/`pg_restore` 18; add `age` (`apt install age` on Debian 12+ per <https://github.com/FiloSottile/age>) and an uploader (`rclone`/`aws-cli`), override `ENTRYPOINT`/`CMD` so it runs the backup script and exits (the stock entrypoint would start a server). Or `FROM debian:trixie-slim` + PGDG apt. Railway's Dockerfile start-command interaction with cron was not verified [GAP].
- **Railpack [P/I]:** supports `RAILPACK_BUILD_APT_PACKAGES` / `RAILPACK_DEPLOY_APT_PACKAGES` (space-separated package names). Docs do not mention adding third-party apt repos or postgresql-client [GAP], so the distro default `postgresql-client` may be older than 18 (not verified). **[I]** Use a Dockerfile to guarantee an 18 client. Source: <https://railpack.com/config/environment-variables>
- **Format [P]:** `-Fc` custom archive is compressed by default, needs `pg_restore` (not psql), allows selective/reordered restore; `-Fd` directory format is the only one supporting parallel dump `-j`. **[I]** (standard behaviour, not separately quoted) plain SQL is psql-loadable and readable but uncompressed and not selectively restorable. Recommended for a small DB: `-Fc`, piped straight to `age` so plaintext never touches disk: `pg_dump -Fc "$DATABASE_URL" | age -R recipients.txt > backup-$(date -u +%F).dump.age`.
- **Restore into local Postgres 18 [I]:** `age -d -i key.txt backup.dump.age > backup.dump`; `createdb restored`; `pg_restore --no-owner --dbname restored backup.dump`. pg_dump is per-database and excludes global roles, so `--no-owner` avoids missing-role errors. Do a restore drill periodically.
- The user's Postgres 18 plugin was not re-verified; Railway's major-upgrade doc lists source majors 14-17 and "any newer major Railway publishes" (<https://docs.railway.com/databases/postgresql-major-upgrade>); the official image is `ghcr.io/railwayapp-templates/postgres-ssl`.

## 5. Client-side encryption with age and key management

- **[P]** `age-keygen -o key.txt` writes the secret key (`AGE-SECRET-KEY-1...`) and prints the public key; `age -r <pubkey>` encrypts; repeated `-r` means every recipient can decrypt; `-R file` reads recipients (one per line, `#` comments); `age -d -i key.txt` decrypts; passphrase mode `-p`; post-quantum keys via `age-keygen -pq` in v1.3.0+ (recipients ~2000 chars). Format spec: <https://age-encryption.org/v1>. Source: <https://github.com/FiloSottile/age>
- **[P]** JS library: npm `age-encryption` (JSR `@age/age-encryption`): `Encrypter.addRecipient` + `encrypt`, `Decrypter.addIdentity` + `decrypt`; Node 20+, Bun, Deno, browsers; depends on noble crypto libs. The page makes no audit/stability claim. Source: <https://github.com/FiloSottile/typage>
- **[I] Key practice for a single-user project:**
  - Generate the keypair on your own machine, not in CI/Railway. Only the **public** key (`age1...`) goes into the repo or a Railway variable; it is not secret, so a public repo is fine.
  - Keep the private key offline in at least two places (password manager + printed/offline copy). Losing it makes all backups unrecoverable; test decryption before relying on it.
  - Optionally add a second recipient as a spare; rotation = new recipient for new backups, keep old private key for old backups.
  - Never print dumps or keys in logs. Prefer the static CLI in the container over the JS lib unless the backup script is Node.
- Bucket credentials: use a scoped/write-only key if the provider supports it (not verified for R2/B2 [GAP]); Railway bucket credentials have no read-only variant per the PITR page [P].

## 6. GitHub Actions on a PUBLIC repository

- **Logs [P]:** "must be logged in to a GitHub account to view workflow run information, including for public repositories"; requires read access. Source: <https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs>. **[I]** public repos grant read to everyone, so any logged-in GitHub user can read logs. Treat logs as public.
- **Artifacts:** docs say "Read access to the repository is required" to download (<https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts>). Docs do not state explicitly that public-repo artifacts are downloadable by anyone logged in [GAP]; **[I]** that follows from public read access. Treat as public. Default retention 90 days (1-90 for public repos); `retention-days` can be set per artifact (<https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository>; retention figures came via search summary, not a direct quote).
- **Secret masking [P]:** "automatic redaction is not guaranteed"; transformed/derived/structured secrets (JSON, base64) may leak; delete logs and rotate on leak. Source: <https://docs.github.com/en/actions/reference/security/secure-use>
- **Schedule [P]:** UTC; shortest 5 min; can be delayed (especially at the start of each hour); "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." Source: <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>
- **Is "Actions + Railway public TCP proxy" sound? [I]** Workable, with caveats:
  - Needs Public Access on the Postgres service (TCP proxy, `DATABASE_PUBLIC_URL`): the DB is internet-reachable, protected only by its password. Railway's image is "SSL-enabled" [P]; enforce `sslmode=require` or stricter. Egress billed at $0.05/GB [P] (negligible).
  - GitHub-hosted runner IPs are not stable, so IP allowlisting is impractical.
  - Dump must be age-encrypted inside the job before any artifact upload or log; only the public key in the workflow; DB URL in an Actions secret.
  - The 60-day inactivity auto-disable can silently stop backups; failure emails to the workflow owner were not verified [GAP].
  - Prefer pushing the encrypted file to R2/B2 from the job rather than leaving it as an artifact.
  - **Verdict [I]:** a Railway cron service on the private network is the sounder default (no public DB exposure, no public logs). The Actions path is acceptable as a secondary backup only if exposing the TCP proxy is acceptable.

## Open gaps to confirm before building

1. Whether `.railway/railway.ts` gains a cron/schedule option (not documented as of 2026-10-14).
2. Max runtime of a Railway cron run, and restart-policy interaction with cron exits.
3. Railway snapshot consistency semantics (ask Railway, or test a restore).
4. R2/B2 scoped (write-only) API key support and signup payment-method requirements.
5. Whether Railpack's default `postgresql-client` is v18 (use a Dockerfile to avoid the question).
