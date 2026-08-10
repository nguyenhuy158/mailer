import { Hono } from "hono";
import { required, type Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

interface SendRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

function isSendRequest(body: unknown): body is SendRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const toOk =
    typeof b.to === "string" || (Array.isArray(b.to) && b.to.every((t) => typeof t === "string"));
  return toOk && typeof b.subject === "string" && (typeof b.html === "string" || typeof b.text === "string");
}

app.get("/", (c) => c.json({ service: "mailer", status: "ok" }));

/**
 * Single send endpoint for every relying app. Callers reach this over a
 * Cloudflare Service Binding (env.MAILER.fetch/env.MAILER.send), never over
 * the public internet — this Worker has no route and workers_dev is off.
 * The Authorization check is defense-in-depth for that assumption, not the
 * primary control.
 */
app.post("/send", async (c) => {
  const expected = required(c.env.INTERNAL_API_KEY, "INTERNAL_API_KEY");
  const provided = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) return c.json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!isSendRequest(body)) {
    return c.json({ error: "expected { to, subject, html|text }" }, 400);
  }

  const apiKey = required(c.env.RESEND_API_KEY, "RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: body.from || c.env.DEFAULT_FROM,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      reply_to: body.replyTo,
    }),
  });

  const data = (await res.json()) as { id?: string };
  if (!res.ok) {
    console.error("Resend error:", data);
    return c.json({ error: "send_failed", detail: data }, 502);
  }
  return c.json({ id: data.id });
});

export default app;
