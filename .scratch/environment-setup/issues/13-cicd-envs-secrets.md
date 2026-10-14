# Grill: CI/CD, environments and secrets
Type: grilling
Status: resolved
Blocked by: 03

## Question

Decide the deploy trigger (Railway from GitHub), CI checks, staging vs production only, and secrets/variables handling including local .env.

## Answer

Decided with the user (all eight accepted; Q1 amended: the repository is **public**, because private repositories have limited GitHub Actions minutes).

- **Hosting:** a public GitHub repository named `kabigting-apps`; Railway's GitHub integration deploys from `main`. Nothing is created or pushed until the user says so.
- **Consequences of a public repo (agreed handling):**
  - Nothing sensitive is ever committed: `.env` stays ignored, the Access database and any exports or import fixtures stay out of the repo (add a git-ignored `data/` folder), and `.railway/railway.ts` references variables rather than values.
  - CI holds no production secrets, so pull requests from forks are harmless.
  - The git author email in the existing commits is the user's personal address, which would become public. Before the first push, set a GitHub noreply address and rewrite those commits' author (no remote exists yet, so this is easy). Pending the user's go-ahead.
  - The repository, including `.scratch/` research and decisions, is readable by anyone. A public repository without a licence is "all rights reserved"; choosing a licence is left to the user.
- **Flow:** feature branches, pull request runs CI, merge into `main` deploys to production. `main` is protected with CI required. Confirm Railway's "wait for GitHub checks" setting during scaffold.
- **Environments:** production only, plus local Docker. Add staging when an App is first shared with a Guest or a change is too risky to try on real data.
- **CI (GitHub Actions, Node 24, pnpm cached store):** (1) `pnpm check`; (2) unit tests and integration tests against a Postgres 18 service container; (3) production build, then Playwright end-to-end on Chromium and WebKit with cached browsers. All run on every pull request. First cut if too slow: WebKit on pull requests, running it only on `main`.
- **Railway configuration:** `.railway/railway.ts` (Infrastructure as Code), applied by hand with `railway config apply` from the user's laptop when infrastructure changes. No Railway token in GitHub. The Railway CLI is a `devDependency`. The generated domain is set manually.
- **Secrets:** Railway variables hold `DATABASE_URL` (referencing the Postgres service), `BETTER_AUTH_SECRET` (sealed) and the public base URL. Local uses an untracked `.env` from the committed `.env.example`. CI uses an ephemeral database and a throwaway auth secret. The first Admin's password is never stored; it is created by running the seed script once. The server parses its environment with Zod at start and refuses to boot on a missing or malformed value.
- **Dependencies:** Dependabot security alerts and security-fix pull requests only. Version upgrades are manual. `pnpm audit --prod` runs in CI as information only.
- **Health and rollback:** `/api/health` returns 200 only when the database answers, and Railway's deploy healthcheck points at it. Railway's one-click rollback works for additive migrations only (expand-then-contract). External uptime monitoring stays in the fog under Observability.
