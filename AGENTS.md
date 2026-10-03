# Repository Guidelines

## Project Structure & Module Organization

mailer is a single Cloudflare Worker (Hono) that sends transactional email via
Resend, so no other app holds a `RESEND_API_KEY`. Other Workers call
`POST /send` through a Cloudflare Service Binding with a shared
`INTERNAL_API_KEY` bearer token. The only public surface is an SSO-gated log
page at <https://mail.huyab.click> (`GET /`), restricted to `ADMIN_EMAIL`.
`workers_dev` is off. HTML is rendered server-side from template strings; there
is no build step and no client bundle.

Folder structure:

```text
src/
  index.ts         # Hono app: /favicon.svg, GET / (log page, huyab_sso via @huyab/sso), POST /send, 404/500 pages
  env.ts           # Env bindings type (DB, secrets, vars) + required() guard
schema.sql         # D1 schema for mailer_sent_emails (create-only; D1 is shared)
e2e/               # HTTP smoke suites (plain fetch, no browser; harness from @huyab/e2e)
  run.mjs          #   `pnpm e2e`: wrangler dev with a local INTERNAL_API_KEY, both suites
  readonly-smoke.mjs #   GET-only checks, also run against prod (`pnpm e2e:prod`)
  dev-smoke.mjs    #   POST /send guard checks (401/400); assertLocalOnly, never reaches Resend or prod
wrangler.jsonc     # Worker config: vars, D1 binding, mail.huyab.click custom domain
.dev.vars.example  # Template for local secrets (copy to .dev.vars)
```

The D1 database is shared with sso/shopee-tracker, hence the `mailer_` table
prefix; `schema.sql` only ever creates tables, never drops them.

## Build, Test, and Development Commands

- `pnpm install`: install project dependencies.
- `pnpm dev`: run `wrangler dev` (needs `.dev.vars`, copy from
  `.dev.vars.example`).
- `pnpm check`: run `tsc --noEmit`.
- `pnpm build`: bundle without deploying (`wrangler deploy --dry-run`, output
  in `dist/`); catches bundling errors the typecheck misses.
- `pnpm lint`: run `biome check .` (formatter + recommended lint rules).
- `pnpm format`: run `biome format --write .`. Format only the files you touch;
  do not mass-reformat unrelated code.
- `pnpm e2e`: start `wrangler dev` on port 8792 (`E2E_PORT`) with a throwaway
  `INTERNAL_API_KEY`, run both smoke suites, stop the server.
- `pnpm e2e:prod`: run only the read-only suite against
  <https://mail.huyab.click>.
- `pnpm deploy`: `wrangler deploy` from a laptop. Pushing to `main` deploys
  through Cloudflare Workers Builds.

Use `pnpm` for all package commands (`pnpm exec wrangler ...`, never `npx`).
Secrets are set with `pnpm exec wrangler secret put RESEND_API_KEY` and
`pnpm exec wrangler secret put INTERNAL_API_KEY`.

## Coding Style & Naming Conventions

Use TypeScript with strict compiler settings. Prefer named exports and type
imports with `import type`. Follow the existing style: two-space indentation,
double quotes, trailing commas, small top-level functions such as `escapeHtml`
or `shell`. Do not leave magic strings or magic numbers in code; extract them
into clearly named constants (see `SSO_AUDIENCE` in `index.ts`).
Split complex logic into small, named functions with one clear responsibility.
Escape every value rendered into HTML with `escapeHtml`.

## Testing Guidelines

Coverage is HTTP smoke in `e2e/`. `pnpm e2e` runs `readonly-smoke.mjs` (401
log page with the SSO link, favicon, 404 page) and `dev-smoke.mjs` (`POST /send`
rejects a missing/wrong bearer and bad bodies) against `wrangler dev`; CI runs
it in the `e2e` job. `pnpm e2e:prod` runs only the read-only suite: GET
requests only, never `POST /send`. Sending real mail is not covered; verify it
by hand with `pnpm dev` and a real `RESEND_API_KEY`, then check the row on the
log page. Also run `pnpm check` and `pnpm build`. If unit tests are added,
prefer Vitest with colocated `*.test.ts` files.

## Commit & Pull Request Guidelines

Use concise Conventional Commits, for example `feat: store and show the email
body in the log page` or `fix: reject requests without a bearer token`. Pull
requests should include a short summary, typecheck results, linked issue if
available, and screenshots for visible UI changes.

## Ecosystem

See the [huyab.click ecosystem map](https://github.com/nguyenhuy158/kit/blob/main/docs/ECOSYSTEM.md) for how all personal repos connect.

- Kit packages: `@huyab/sso` (`verifySsoToken` with `audience: "huyab.click"`
  for the log page cookie), `@huyab/e2e` (`startServer`, `run`, harness,
  `assertLocalOnly` in `e2e/`), `@huyab/config` (Biome + tsconfig base),
  reusable CI `nguyenhuy158/kit/.github/workflows/check.yml@v0.1.0`.
- Talks to: sso (JWKS at `auth.huyab.click` for `GET /`), Resend API, shared
  D1 `db` (`mailer_` prefix). Called by ai-english, chia-keo and monitor
  through the `MAILER` Service Binding (`POST /send`, `INTERNAL_API_KEY`).

## Agent-Specific Instructions

Keep responses short and focused. If a requirement is unclear, ask before making
assumptions.
Design UI/UX to fit inside a single viewport by default. Avoid page-level
scrolling; use compact layouts, tabs, panes, or contained internal lists when
content can overflow.
Never commit `.dev.vars` or secrets. Keep `POST /send` reachable only with the
`INTERNAL_API_KEY` bearer token.
