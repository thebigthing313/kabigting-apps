import { z } from "zod"

const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  BETTER_AUTH_SECRET: z.string().min(32),
  BASE_URL: z.url({ protocol: /^https?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]),
})

export type Env = z.infer<typeof schema>

/** Parses the process environment at start; the server refuses to boot on a bad value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source)
  if (result.success) return result.data
  // Name the bad keys only: values may be secrets.
  const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
  throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`)
}
