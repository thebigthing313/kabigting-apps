# Grill: Backups
Type: grilling
Status: resolved
Blocked by: 03

## Question

Decide backup and restore approach for the family's financial data: Railway backups, off-platform dumps, frequency, and restore rehearsal.

## Answer

Decided with the user: these are convenience apps, so data loss is not catastrophic.

- **Backups:** Railway's volume backups only. Use whatever Railway's standard schedule provides (the Railway research found daily, weekly and monthly backups, kept 6, 27 and 89 days, plus manual backups). No independent off-platform copy, no `pg_dump` job, no encryption, no key custody.
- **Implied recovery targets:** losing up to about a day of entries is acceptable; being offline while restoring is acceptable.
- **At scaffold time (proposed defaults, not discussed with the user):**
  - Confirm the backup schedules are actually enabled on the Postgres volume (the research did not establish that they are on by default) and record where to see them.
  - Take a manual backup before any deploy containing a destructive or hard-to-reverse migration.
  - Do one restore rehearsal once real data exists: Railway's restore mounts a new volume, so note the steps in the README.
  - Railway's docs do not say whether volume backups are consistent for a running Postgres; accepted risk given the stakes.
- **Out of scope:** off-platform backups, encrypted dumps, long retention beyond Railway's, and automated backup monitoring. Revisit if the data becomes hard to recreate (for example after the Access data is imported and the Access file is retired).

## Answer

Decided with the user: these are convenience apps, so data loss is not catastrophic.

- **Backups:** Railway's volume backups only. Use whatever Railway's standard schedule provides (the Railway research found daily, weekly and monthly backups, kept 6, 27 and 89 days, plus manual backups). No independent off-platform copy, no `pg_dump` job, no encryption, no key custody.
- **Implied recovery targets:** losing up to about a day of entries is acceptable; being offline while restoring is acceptable.
- **At scaffold time (proposed defaults, not discussed with the user):**
  - Confirm the backup schedules are actually enabled on the Postgres volume (the research did not establish that they are on by default) and record where to see them.
  - Take a manual backup before any deploy containing a destructive or hard-to-reverse migration.
  - Do one restore rehearsal once real data exists: Railway's restore mounts a new volume, so note the steps in the README.
  - Railway's docs do not say whether volume backups are consistent for a running Postgres; accepted risk given the stakes.
- **Out of scope:** off-platform backups, encrypted dumps, long retention beyond Railway's, and automated backup monitoring. Revisit if the data becomes hard to recreate (for example after the Access data is imported and the Access file is retired).
