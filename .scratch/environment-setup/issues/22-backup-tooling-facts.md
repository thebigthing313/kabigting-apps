# Research: Backup tooling facts
Type: research
Status: resolved
Blocked by: none

## Question

Facts the backups ticket waits on, as of 2026-10-14:
1. Railway volume backups for Postgres: are they crash-consistent? Any documented guidance on `pg_dump` vs volume backups? Restore procedure and cost.
2. Railway scheduled (cron) services: how to define one, run time limits, failure behaviour and notifications, IaC support in `.railway/railway.ts`, private-network access to Postgres.
3. Railway storage buckets (S3-compatible): availability, pricing, durability; versus Cloudflare R2 and Backblaze B2 free tiers and egress costs.
4. Running `pg_dump` 18 in a Railway-built container (Railpack or a Dockerfile): how to get the 18 client; `pg_dump` custom format vs plain SQL; `pg_restore` into local Postgres 18.
5. Client-side encryption of dumps with `age` (CLI or JS library) and key-management practice for a single-user project.
6. GitHub Actions artifacts and logs visibility on a public repository (confirm they are publicly readable), and whether a scheduled workflow connecting to Railway Postgres is a sound alternative.

## Answer

Not needed. The user chose Railway's own backups only (see "Grill: Backups"), so off-platform storage, scheduled dumps and encryption are out of scope. Any findings the agent committed to `research/backup-tooling-facts` are kept for reference only.

## Answer

Not needed. The user chose Railway's own backups only (see "Grill: Backups"), so off-platform storage, scheduled dumps and encryption are out of scope. Anything the agent committed to `research/backup-tooling-facts` is kept for reference only.

## Late findings (kept for reference; they do not change the Railway-only decision)

Branch `research/backup-tooling-facts` (commit 9afb934), file `.scratch/environment-setup/research/22-backup-tooling-facts.md`. Agent output, not reviewed by the user.

- Railway volume backups are incremental copy-on-write snapshots billed at volume rates ($0.15/GB-month); restore stages a new volume. The docs say nothing about crash-consistency or `pg_dump`. Railway also documents point-in-time recovery (pgBackRest to a Railway bucket), which stays on-platform.
- Cron services are set in the dashboard (5-field UTC crontab, at least 5 minutes apart). `.railway/railway.ts` documents no cron option; `cronSchedule` exists only in the deprecated `railway.json`, which stops being read on 2026-12-01.
- If off-platform backups are ever added: a Railway cron on the private network with `pg_dump -Fc` (client 18 via a Dockerfile) piped into `age`, to R2 or B2; GitHub Actions is a poor fit on a public repo (logs and probably artifacts readable by any logged-in user, scheduled workflows auto-disable after 60 days of inactivity).
