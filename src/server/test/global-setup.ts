import type { TestProject } from "vitest/node"
import {
  createTemplate,
  dropOrphanedDatabases,
  dropRunDatabases,
  newRunId,
} from "#server/test/databases.ts"

// Each run gets its own databases, so integration runs in parallel worktrees never collide.
// Teardown drops them; a run that crashed is cleaned up by the next one.
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const run = newRunId()
  await dropOrphanedDatabases()
  await createTemplate(run)
  project.provide("testDatabaseRun", run)
  return () => dropRunDatabases(run)
}
