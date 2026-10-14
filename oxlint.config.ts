import { defineConfig } from "oxlint"
import { APP_KEYS } from "./src/server/core/apps.ts"

/** Each App gets an override that forbids importing any other App's folder. */
const APPS: readonly string[] = APP_KEYS

type Pattern = { regex: string; message: string; allowTypeImports?: boolean }

// Patterns match the import specifier string, not the resolved file, so each rule lists the
// alias form and the relative form.
const tanstackDb: Pattern = {
  regex: "^@tanstack/(db|react-db|query-db-collection)(/|$)",
  message: "TanStack DB may only be imported inside src/client/data/.",
}
const dateFns: Pattern = {
  regex: "^(date-fns|@date-fns/tz)(/|$)",
  message: "Use src/shared/dates.ts; it is the only importer of date-fns.",
}
const serverFromClient: Pattern = {
  regex: "^(#server/|(\\.\\./)+server(/|$))",
  message: "src/client must not import src/server (only src/client/data/api.ts may import types).",
}
const clientFromServer: Pattern = {
  regex: "^(@/|#client/|(\\.\\./)+client(/|$))",
  message: "src/server must not import src/client.",
}
const sharedForbidden: Pattern[] = [
  {
    regex: "^(@/|#client/|#server/|(\\.\\./)+(client|server)(/|$))",
    message: "src/shared must not import src/client or src/server.",
  },
  {
    regex: "^(hono|pg|drizzle-orm|better-auth|@hono/[^/]+|@better-auth/[^/]+)(/|$)",
    message: "src/shared must stay free of hono, pg, drizzle-orm and better-auth.",
  },
]

/** Forbids importing any other App's folder; empty while there is only one App. */
function otherApps(app: string): Pattern[] {
  const others = APPS.filter((a) => a !== app)
  if (others.length === 0) return []
  const alt = others.join("|")
  return [
    {
      regex: `((^|/)apps/(${alt})(/|$)|^(\\.\\./)+(${alt})(/|$))`,
      message: `App "${app}" must not import another App's folder.`,
    },
  ]
}

function restrict(patterns: Pattern[]): {
  "no-restricted-imports": ["error", { patterns: Pattern[] }]
} {
  return { "no-restricted-imports": ["error", { patterns }] }
}

// Overrides do not merge rule options: the last matching override wins for a rule, so every
// entry lists the full set of patterns for its files, ordered from general to specific.
const appOverrides = APPS.flatMap((app) => [
  {
    files: [`src/client/apps/${app}/**`],
    rules: restrict([serverFromClient, tanstackDb, dateFns, ...otherApps(app)]),
  },
  {
    files: [`src/server/apps/${app}/**`],
    rules: restrict([clientFromServer, tanstackDb, dateFns, ...otherApps(app)]),
  },
])

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "react"],
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  options: {
    typeAware: true,
    reportUnusedDisableDirectives: "error",
  },
  env: {
    builtin: true,
  },
  ignorePatterns: [
    "dist/**",
    "src/client/routeTree.gen.ts",
    "src/server/db/schema/auth.ts",
    "src/server/db/migrations/**",
    ".claude/**",
  ],
  rules: {
    "typescript/no-explicit-any": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "no-unused-vars": "error",
    "no-console": "off",
    // The automatic JSX runtime needs no React in scope.
    "react/react-in-jsx-scope": "off",
    ...restrict([tanstackDb, dateFns]),
  },
  overrides: [
    {
      files: ["src/client/**"],
      env: { browser: true },
      rules: {
        "no-console": "error",
        ...restrict([serverFromClient, tanstackDb, dateFns]),
      },
    },
    {
      files: ["src/client/data/**"],
      rules: restrict([serverFromClient, dateFns]),
    },
    {
      files: ["src/client/data/api.ts"],
      rules: restrict([{ ...serverFromClient, allowTypeImports: true }, dateFns]),
    },
    {
      files: ["src/server/**", "scripts/**"],
      env: { node: true },
      rules: restrict([clientFromServer, tanstackDb, dateFns]),
    },
    {
      files: ["src/shared/**"],
      rules: restrict([...sharedForbidden, tanstackDb, dateFns]),
    },
    {
      files: ["src/shared/dates.ts"],
      rules: restrict([...sharedForbidden, tanstackDb]),
    },
    ...appOverrides,
    {
      // shadcn output: keep correctness, relax rules that fight its generated patterns.
      files: ["src/client/components/ui/**"],
      rules: {
        "react/only-export-components": "off",
        "react/no-array-index-key": "off",
        "no-shadow": "off",
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
  ],
})
