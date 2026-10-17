# Backups and restore

The database is backed up by Railway's volume backups only. These are convenience Apps: losing up
to about a day of entries, and being offline while a restore runs, are both acceptable. There is
no off-platform copy, no `pg_dump` job and no encryption key to look after.

## What is backed up

Railway snapshots the Postgres service's volume (copy-on-write, billed only for data unique to a
backup). Schedules, set per volume:

| Schedule | Taken     | Kept    |
| -------- | --------- | ------- |
| Daily    | every 24h | 6 days  |
| Weekly   | every 7d  | 27 days |
| Monthly  | every 30d | 89 days |

Manual backups can be taken at any time (each may be at most 50% of the volume's size).

Where to see them: Railway project, **Postgres** service, **Backups** tab.

### Check once, after the first deploy

- [x] Daily, weekly and monthly schedules are enabled on the Postgres volume (they are not
      assumed to be on by default). Enabled 2026-10-14.
- [ ] A first backup appears in the Backups tab the next day.

## Before a risky deploy

Take a manual backup first when a deploy includes a migration that drops or narrows anything, or
rewrites data:

1. Postgres service, **Backups** tab, **Create backup**.
2. Wait until it shows as completed, then merge or deploy.

Migrations are forward-only. Recovery from a bad migration is a fix-forward migration or this
restore. Railway's one-click rollback of the app does not undo a migration, so destructive
changes ship in a later migration than the code that stops using the old column.

## Restore

A restore replaces the database with the backup's contents. Every entry made after the backup is
lost. The app is unavailable while Postgres restarts.

1. Railway project, **Postgres** service, **Backups** tab.
2. Find the backup by date and choose **Restore**.
3. Railway stages a new volume, named after the backup's date, mounted at the same path. The
   current volume is kept, unmounted, in the project; newer backups stay attached to it.
4. Review the staged change under **Details**, then **Deploy**.
5. When Postgres is running again, check the app:
   - `https://<domain>/api/health` returns `{"ok":true}`;
   - sign in and open Finances (or the App whose data mattered) and spot-check recent entries.
6. If the restored data is wrong, restore a different backup the same way. The previous volume
   is still in the project until deleted by hand.

Limits:

- A restore only works within the same project and environment.
- Wiping a volume deletes all of its backups: never wipe the Postgres volume.
- Railway does not state whether a snapshot of a running Postgres is crash-consistent. Postgres
  recovers a consistent snapshot the way it recovers from a crash (WAL replay), which is why a
  rehearsal matters.

## Rehearsal (once, after real data exists)

Do this once the finances data is in, before relying on backups:

1. Take a manual backup.
2. Note a few recent entries (dates and amounts).
3. Restore the backup taken before those entries, following the steps above.
4. Confirm the app comes back healthy and those entries are absent, as expected.
5. Restore the manual backup from step 1 and confirm the entries are back.
6. Record the date and anything surprising here.

| Date | Result |
| ---- | ------ |
|      |        |

## Not covered

Off-platform or encrypted copies, retention beyond Railway's, and backup monitoring are out of
scope. Revisit them if the data becomes hard to recreate (for example once the Access data has
been imported and the Access file retired). Railway also offers point-in-time recovery for
Postgres (pgBackRest to a Railway bucket); it is still on-platform and not used.
