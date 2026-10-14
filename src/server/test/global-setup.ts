import { createTemplate } from "#server/test/databases.ts"

export default async function setup(): Promise<void> {
  await createTemplate()
}
