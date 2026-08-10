# mailer

Single Worker that sends transactional email via Resend, so no other app
holds a `RESEND_API_KEY`. Not reachable from the public internet — no
`routes`, `workers_dev` off — only via a Cloudflare Service Binding.

## Setup

```
npm install
wrangler secret put RESEND_API_KEY
wrangler secret put INTERNAL_API_KEY   # any random string; shared with callers below
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
