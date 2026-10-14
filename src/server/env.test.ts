import { expect, test } from "vitest"
import { parseEnv } from "./env.ts"

const valid = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/kabigting",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BASE_URL: "http://localhost:5173",
  PORT: "3000",
  NODE_ENV: "development",
}

test("parses a complete environment", () => {
  expect(parseEnv(valid)).toEqual({ ...valid, PORT: 3000 })
})

test("defaults PORT to 3000", () => {
  const { PORT: _, ...rest } = valid
  expect(parseEnv(rest).PORT).toBe(3000)
})

test.each(["DATABASE_URL", "BETTER_AUTH_SECRET", "BASE_URL", "NODE_ENV"] as const)(
  "refuses to boot without %s",
  (key) => {
    expect(() => parseEnv({ ...valid, [key]: undefined })).toThrow(key)
  },
)

test.each([
  ["BETTER_AUTH_SECRET", "too-short"],
  ["DATABASE_URL", "mysql://localhost/x"],
  ["BASE_URL", "not a url"],
  ["PORT", "eighty"],
  ["NODE_ENV", "staging"],
])("refuses a malformed %s", (key, value) => {
  expect(() => parseEnv({ ...valid, [key]: value })).toThrow(key)
})

test("never echoes the secret in the error", () => {
  expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short-secret-value" })).not.toThrow(
    "short-secret-value",
  )
})
