# Splitwise API: paid and owed shares for a group

Research for #155. Facts only, no recommendation.

## Sources

Splitwise publishes no official SDK; the SDKs listed in its docs are third-party and "have not
been reviewed or endorsed by Splitwise". The one primary source is Splitwise's own OpenAPI 3.0.1
spec in [splitwise/api-docs](https://github.com/splitwise/api-docs). That repo builds
[dev.splitwise.com](https://dev.splitwise.com/) (its `docs/CNAME`). Links below are pinned to
commit
[`f7bdbe2`](https://github.com/splitwise/api-docs/tree/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c),
the latest commit as of this note (2026-07-28). The base URL is
`https://secure.splitwise.com/api/v3.0`
([`splitwise.yaml`](https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/splitwise.yaml)).
No live API calls were made.

[get_expenses]: https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/paths/get_expenses.yaml
[expense]: https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/schemas/expense.yaml
[share]: https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/schemas/share.yaml
[root]: https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/splitwise.yaml

## Per-user paid and owed shares

- `GET /get_expenses` takes a `group_id` query parameter: "If provided, only expenses in that
  group will be returned, and `friend_id` will be ignored." It returns `{ expenses: Expense[] }`
  ([get_expenses]).
- Each Expense has a `users` array of Share objects ([expense]). A Share has `user_id`,
  `user` (`id`, `first_name`, `last_name`, `picture`), and the strings `paid_share`, `owed_share`
  and `net_balance`, for example `"8.99"`, `"4.5"`, `"4.49"` ([share]).
- An Expense also has `repayments`, an array of `{ from, to, amount }`: from is the owing user's
  ID, to is the owed user's ID, amount is a string ([expense]).
- `cost` is "a string representation of a decimal value, limited to 2 decimal places", with
  `currency_code` beside it
  ([`expense/common.yaml`](https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/schemas/expense/common.yaml)).
  All money fields in the schema are decimal strings, not numbers.
- `GET /get_expense/{id}` returns one Expense with the same schema
  ([`get_expense.yaml`](https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/paths/get_expense.yaml)).

## Category and the payment flag

- Each Expense has `category: { id, name }`; `name` is "translated to the current user's
  locale" ([expense]). The writable field is `category_id`, "a category id from
  `get_categories`" ([`expense/common.yaml`](https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/schemas/expense/common.yaml)).
- `GET /get_categories` needs no auth (`security: []`). It returns parent categories, each with
  subcategories. Expenses must be created with a subcategory
  ([`get_categories.yaml`](https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/paths/get_categories.yaml)).
- Each Expense has `payment: boolean`, "whether this was a payment between users", and
  `transaction_confirmed: boolean`, for payments made through an integrated third-party service
  ([expense]).
- Other fields on the Expense: `id` (int64), `group_id`, `friendship_id`, `expense_bundle_id`,
  `description`, `details` (notes), `date`, `created_at`, `created_by`, `updated_at`,
  `updated_by`, `repeats`, `repeat_interval`, `comments_count`, `receipt`, `comments` ([expense]).

## Authentication

The root spec names two security schemes, either of which is accepted ([root]):

- **ApiKeyAuth**: "For speed and ease of prototyping, you can generate a personal API key on
  your app's details page. You should present this key to the server via the Authorization
  header as a Bearer token. The API key is an access token for your personal account, so keep it
  as safe as you would a password."
- **OAuth**: OAuth 2 authorization code flow, `/oauth/authorize` and `/oauth/token`. "You'll
  need to [register your app](https://secure.splitwise.com/apps). When you register, you'll be
  given a key and secret."

Both start from registering an app at `secure.splitwise.com/apps`. The personal API key is then
generated on that app's page.

The Terms of Use in the same file say the Self-Serve API is "not intended for commercial use",
that it is open to "hobbyists and power users to programmatically interact with their own
Splitwise account", and that "Splitwise may impose conditions on the use of the Self-Serve API,
including, for example, maintaining an active Splitwise Pro subscription" ([root]).

## Paging and rate limits

- Paging is `limit` (integer, default `20`) and `offset` (integer, default `0`). The spec gives
  no maximum for `limit` and no total count or next-page cursor in the response ([get_expenses]).
  It does not document a special value such as `limit=0`.
- Filters: `dated_after`, `dated_before`, `updated_after`, `updated_before`, all date-time
  ([get_expenses]). (The spec lists `updated_after`'s format as `update-time`, which looks like a
  typo for `date-time`.)
- At the default `limit` of 20, 1,100 expenses take 55 requests. The spec states no ordering for
  the list.
- Rate limits ([root], "Rate Limits"): they "vary by endpoint and resource, and are subject to
  change at any time without notice". Going over returns `HTTP 429 Too Many Requests`; clients
  should "slow down ... and retry after a short delay". "In practice, our rate limits are fairly
  lenient, and almost no hobby integration has ever exceeded them." No numbers are published, and
  no rate-limit headers or `Retry-After` are documented.

## Deleted expenses

- The Expense schema has `deleted_at` (nullable date-time, "if the expense was deleted, when it
  was deleted") and `deleted_by` (nullable user) ([expense]).
- Deletion is soft: `POST /delete_expense/{id}` and `POST /undelete_expense/{id}` ("Restore an
  expense") both exist. Both return `200` with `{ success, errors }`, and "200 OK does not
  indicate a successful response" — only `success: true` does
  ([`delete_expense.yaml`](https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/paths/delete_expense.yaml),
  [`undelete_expense.yaml`](https://github.com/splitwise/api-docs/blob/f7bdbe2d639b74c649ad3971d68bc4b5262cbb2c/paths/undelete_expense.yaml)).
- **The spec does not say whether `get_expenses` includes deleted expenses**, and it has no
  parameter to include or exclude them. The only documented way to tell a deleted expense apart is
  a non-null `deleted_at` on the returned object. Whether deleted rows actually come back can only
  be confirmed against the live API; this note did not do that.
- The api-docs issue tracker has no issue on this
  ([search](https://github.com/splitwise/api-docs/issues?q=deleted)).

## Open points the spec leaves unanswered

- Whether `get_expenses` returns deleted expenses by default.
- The maximum `limit` per request, and the sort order of results.
- The numbers behind the rate limits.
- Whether a Pro subscription is currently required for API access (the terms say only that it
  "may" be).
