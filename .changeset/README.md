# Changesets

Each change that matters to people using the app gets a changeset: run `pnpm changeset`, pick the
bump (patch, minor, major) and write one line for the changelog. `pnpm version-packages` folds the
pending changesets into `package.json` and `CHANGELOG.md`. Nothing is published to npm.
