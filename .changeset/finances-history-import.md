---
"kabigting-apps": minor
---

Finances: a one-time import brings the household's old history over. `scripts/finances-extract.ps1`
reads the old Access file read-only, through a local map of its table and column names, into
neutral JSON in `exports/`. `pnpm finances:import` then loads every past Actual onto Checking,
already reviewed so none lands in To review, along with the 18 agreed Categories (including the new
Card payments), the Accounts history uses and each day's last Balance check. It has a dry run,
refuses when Finances holds data unless given `--wipe`, writes in one transaction, and prints a
counts-only report that fails on any mismatch.
