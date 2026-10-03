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
  index.ts         # Hono app: /favicon.svg, GET / (log page), POST /send, 404/500 pages
  env.ts           # Env bindings type (DB, secrets, vars) + required() guard
  sso.ts           # huyab_sso cookie reader + JWT verification against the issuer JWKS
schema.sql         # D1 schema for mailer_sent_emails (create-only; D1 is shared)
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
into clearly named constants (see `COOKIE_NAME`, `EXPECTED_AUD` in `sso.ts`).
Split complex logic into small, named functions with one clear responsibility.
Escape every value rendered into HTML with `escapeHtml`.

## Testing Guidelines

There is no automated test suite. Verify changes with `pnpm check` and
`pnpm build`, then exercise `pnpm dev`: `POST /send` with the bearer token, check the
row on the log page. If tests are added, prefer Vitest with colocated
`*.test.ts` files.

## Commit & Pull Request Guidelines

Use concise Conventional Commits, for example `feat: store and show the email
body in the log page` or `fix: reject requests without a bearer token`. Pull
requests should include a short summary, typecheck results, linked issue if
available, and screenshots for visible UI changes.

## Agent-Specific Instructions

Keep responses short and focused. If a requirement is unclear, ask before making
assumptions.
Design UI/UX to fit inside a single viewport by default. Avoid page-level
scrolling; use compact layouts, tabs, panes, or contained internal lists when
content can overflow.
Never commit `.dev.vars` or secrets. Keep `POST /send` reachable only with the
`INTERNAL_API_KEY` bearer token.
