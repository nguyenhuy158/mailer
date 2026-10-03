# mailer

Single Worker that sends transactional email via Resend, so no other app
holds a `RESEND_API_KEY`. `POST /send` is only callable via a Cloudflare
Service Binding with the `INTERNAL_API_KEY` bearer token (`workers_dev` off);
the only public route is the SSO-gated log page at `mail.huyab.click`.

## Setup

```
pnpm install
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put INTERNAL_API_KEY   # any random string; shared with callers below
```

Deploys happen automatically on push to `main` via Cloudflare Workers Builds.

## Calling it from another Worker

In the caller's `wrangler.jsonc`:

```jsonc
"services": [{ "binding": "MAILER", "service": "mailer" }]
```

Then, in the caller's own secrets, set the same value as `INTERNAL_API_KEY`
(e.g. `wrangler secret put MAILER_KEY`), and call:

```ts
const res = await env.MAILER.fetch("https://mailer/send", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.MAILER_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "someone@example.com",
    subject: "Hello",
    html: "<p>Hi</p>",
  }),
});
```

The URL host in `env.MAILER.fetch(...)` is arbitrary — service bindings
route by binding, not by the hostname — `https://mailer/send` is just a
readable placeholder.
