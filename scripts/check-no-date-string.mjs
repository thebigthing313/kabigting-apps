// Rule 7: no `new Date(<string>)`. Only src/shared/dates.ts may parse dates.
// Flags `new Date(` whose argument is not empty and not a plain number literal.
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

const root = process.argv[2] ?? "src"
const allowed = new Set(["src/shared/dates.ts"])
const skipDirs = new Set(["node_modules", "dist", "migrations"])
const exts = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const pattern = /new\s+Date\s*\(([^)]*)\)/g
const numeric = /^\s*-?[\d_]+(\.\d+)?\s*$/

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return skipDirs.has(entry.name) ? [] : walk(path)
    return exts.test(entry.name) ? [path] : []
  })
}

const failures = []
for (const file of walk(root)) {
  const rel = relative(process.cwd(), file).split(sep).join("/")
  if (allowed.has(rel)) continue
  const lines = readFileSync(file, "utf8").split("\n")
  lines.forEach((line, i) => {
    for (const match of line.matchAll(pattern)) {
      const arg = match[1] ?? ""
      if (arg.trim() === "" || numeric.test(arg)) continue
      failures.push(`${rel}:${i + 1}: ${match[0]}`)
    }
  })
}

if (failures.length > 0) {
  console.error("new Date(<non-numeric>) is not allowed outside src/shared/dates.ts:")
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
