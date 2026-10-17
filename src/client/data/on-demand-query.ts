// Translates what a live query asks an on-demand collection for (its where, orderBy, limit and
// paging cursor) into the server's fixed set of query filters. Anything the filters cannot say
// is refused here, loudly, rather than silently loading the wrong rows.
import type { IR, LoadSubsetOptions } from "@tanstack/db"
import { addDays } from "@shared/dates"
import type { OnDemandQuery } from "@shared/finances/schemas"

export class UnsupportedLiveQueryError extends Error {
  constructor(what: string) {
    super(`An on-demand collection cannot load this live query: ${what}`)
  }
}

type Expression = IR.BasicExpression

function field(expression: Expression | undefined): string {
  // Collection-level requests name the row's own field, with no source alias.
  if (expression?.type === "ref" && expression.path.length === 1) return expression.path[0]!
  throw new UnsupportedLiveQueryError("a comparison must name one field of the row")
}

function value(expression: Expression | undefined): unknown {
  if (expression?.type === "val") return expression.value
  throw new UnsupportedLiveQueryError("a comparison must be against a plain value")
}

function text(expression: Expression | undefined, of: string): string {
  const found = value(expression)
  if (typeof found !== "string") throw new UnsupportedLiveQueryError(`${of} must be a string`)
  return found
}

function later(a: string | undefined, b: string): string {
  return a === undefined || b > a ? b : a
}

function earlier(a: string | undefined, b: string): string {
  return a === undefined || b < a ? b : a
}

function setOnce<Key extends "walletId" | "status">(
  query: OnDemandQuery,
  key: Key,
  next: NonNullable<OnDemandQuery[Key]>,
) {
  if (query[key] !== undefined && query[key] !== next) {
    throw new UnsupportedLiveQueryError(`two different values for ${key}`)
  }
  query[key] = next
}

/** Narrows `query` by one predicate of the live query's where clause. */
function narrow(query: OnDemandQuery, expression: Expression): void {
  if (expression.type !== "func") {
    throw new UnsupportedLiveQueryError("the where clause must be comparisons joined by and")
  }
  const [left, right] = expression.args
  const name = expression.name
  if (name === "and") {
    for (const argument of expression.args) narrow(query, argument)
    return
  }
  const key = field(left)
  if (key === "date") {
    const date = text(right, "date")
    if (name === "eq" || name === "gte" || name === "gt") {
      query.dateFrom = later(query.dateFrom, name === "gt" ? addDays(date, 1) : date)
    }
    if (name === "eq" || name === "lte" || name === "lt") {
      query.dateTo = earlier(query.dateTo, name === "lt" ? addDays(date, -1) : date)
    }
    if (["eq", "gte", "gt", "lte", "lt"].includes(name)) return
  }
  if (name === "eq" && key === "walletId") return setOnce(query, key, text(right, key))
  if (name === "eq" && key === "status") {
    const status = value(right)
    if (status === "planned" || status === "actual") return setOnce(query, key, status)
  }
  if (name === "eq" && key === "categoryId") {
    query.categoryId = text(right, key)
    return
  }
  if (name === "isNull" && key === "categoryId") {
    query.categoryId = null
    return
  }
  if (name === "isNull" && key === "reviewedAt") {
    query.unreviewed = true
    return
  }
  // Ignored rows are left out unless asked for; asking for them loads every row, the local
  // query keeping the ones it wants.
  if (name === "eq" && key === "ignored") {
    if (value(right) === true) query.includeIgnored = true
    return
  }
  if (key === "id" && (name === "eq" || name === "in")) {
    const ids = name === "eq" ? [text(right, "id")] : value(right)
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
      throw new UnsupportedLiveQueryError("ids must be strings")
    }
    query.ids = query.ids ? query.ids.filter((id) => ids.includes(id)) : ids
    return
  }
  throw new UnsupportedLiveQueryError(`${name} on ${key}`)
}

/** The server orders by date, then id in the same direction. Nothing else can be asked for. */
function order(orderBy: IR.OrderBy | undefined): "dateAsc" | "dateDesc" | undefined {
  if (!orderBy || orderBy.length === 0) return undefined
  const [leading, ...rest] = orderBy
  const { direction } = leading!.compareOptions
  if (field(leading!.expression) !== "date") {
    throw new UnsupportedLiveQueryError("rows can only be ordered by date")
  }
  // A locale-sorted string cannot be a paging cursor, so TanStack DB would load every row.
  if (
    !("stringSort" in leading!.compareOptions) ||
    leading!.compareOptions.stringSort !== "lexical"
  ) {
    throw new UnsupportedLiveQueryError("order dates with stringSort: 'lexical'")
  }
  for (const clause of rest) {
    if (field(clause.expression) !== "id" || clause.compareOptions.direction !== direction) {
      throw new UnsupportedLiveQueryError("after date, rows can only be ordered by id")
    }
  }
  return direction === "asc" ? "dateAsc" : "dateDesc"
}

function isEmpty(query: OnDemandQuery): boolean {
  return (
    (query.dateFrom !== undefined && query.dateTo !== undefined && query.dateFrom > query.dateTo) ||
    query.ids?.length === 0
  )
}

/** The cursor's date: the leading order value of the last row already loaded. */
function cursorDate(cursor: NonNullable<LoadSubsetOptions["cursor"]>): string {
  const current = cursor.whereCurrent
  if (current.type === "func" && current.name === "eq" && field(current.args[0]) === "date") {
    return text(current.args[1], "the cursor's date")
  }
  throw new UnsupportedLiveQueryError("paging must follow the date order")
}

/**
 * The server queries that together load what a live query asks for: one, or two when paging on
 * from a cursor (every row on the cursor's date, then a page of rows beyond it). An empty list
 * means nothing can match.
 */
export function toOnDemandQueries(options: LoadSubsetOptions): OnDemandQuery[] {
  if (options.offset) throw new UnsupportedLiveQueryError("offsets; page with limit instead")
  const base: OnDemandQuery = {}
  if (options.where) narrow(base, options.where)
  const sort = order(options.orderBy)
  if (sort) base.order = sort
  const limit = options.limit === undefined ? {} : { limit: options.limit }

  if (!options.cursor) {
    const query = { ...base, ...limit }
    return isEmpty(query) ? [] : [query]
  }
  if (!sort) throw new UnsupportedLiveQueryError("paging needs an order")
  const date = cursorDate(options.cursor)
  const tie: OnDemandQuery = {
    ...base,
    dateFrom: later(base.dateFrom, date),
    dateTo: earlier(base.dateTo, date),
  }
  const beyond: OnDemandQuery =
    sort === "dateDesc"
      ? { ...base, ...limit, dateTo: earlier(base.dateTo, addDays(date, -1)) }
      : { ...base, ...limit, dateFrom: later(base.dateFrom, addDays(date, 1)) }
  return [tie, beyond].filter((query) => !isEmpty(query))
}
