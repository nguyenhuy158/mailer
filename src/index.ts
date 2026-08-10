import { Hono } from "hono";
import { required, type Env } from "./env";
import { readSsoCookie, ssoLoginUrl, verifySsoToken } from "./sso";

const app = new Hono<{ Bindings: Env }>();

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderLogsPage(rows: Record<string, unknown>[]): string {
  const tableRows = rows
    .map((row) => {
      const status = String(row.status);
      const badge = status === "sent" ? "#16a34a" : "#dc2626";
      return `<tr>
        <td>${escapeHtml(String(row.created_at))}</td>
        <td>${escapeHtml(String(row.to_address))}</td>
        <td>${escapeHtml(String(row.subject))}</td>
        <td style="color:${badge};font-weight:600">${escapeHtml(status)}</td>
        <td>${escapeHtml(String(row.resend_id ?? row.error ?? ""))}</td>
      </tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>mailer — send log</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1c1c1c; }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 0.5rem 0.75rem; text-align: left; }
  th { color: #666; font-weight: 500; }
</style>
</head>
<body>
<h1>mailer — nhật ký gửi email</h1>
<table>
  <thead><tr><th>Lúc</th><th>To</th><th>Subject</th><th>Trạng thái</th><th>Resend id / lỗi</th></tr></thead>
  <tbody>${tableRows || '<tr><td colspan="5">Chưa có email nào.</td></tr>'}</tbody>
</table>
</body>
</html>`;
}

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

/**
 * Trang xem log, gate boi SSO — chi ADMIN_EMAIL duoc vao. /send van khong
 * lien quan gi den route nay, van chi goi duoc qua Service Binding.
 */
app.get("/", async (c) => {
  const token = readSsoCookie(c.req.raw.headers);
  const claims = token ? await verifySsoToken(c.env.SSO_ISSUER, token) : null;

  if (!claims) {
    const loginUrl = ssoLoginUrl(c.env.SSO_ISSUER, c.req.url);
    return c.html(`<a href="${loginUrl}">Đăng nhập để xem log</a>`, 401);
  }
  if (claims.email !== c.env.ADMIN_EMAIL) {
    return c.text("Forbidden", 403);
  }

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM mailer_sent_emails ORDER BY created_at DESC LIMIT 200",
  ).all();

  return c.html(renderLogsPage(results));
});

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
  const to = Array.isArray(body.to) ? body.to.join(", ") : body.to;

  if (!res.ok) {
    console.error("Resend error:", data);
    await logSend(c.env.DB, { to, subject: body.subject, status: "failed", error: JSON.stringify(data) });
    return c.json({ error: "send_failed", detail: data }, 502);
  }

  await logSend(c.env.DB, { to, subject: body.subject, status: "sent", resendId: data.id });
  return c.json({ id: data.id });
});

/**
 * Ban ghi audit rieng cua mailer, khong phu thuoc Resend dashboard (retention
 * gioi han, va la nguon ben ngoai). Loi ghi log khong duoc lam sap request
 * gui thanh cong — chi console.error de con thay trong Observability.
 */
async function logSend(
  db: D1Database,
  entry: { to: string; subject: string; status: "sent" | "failed"; resendId?: string; error?: string },
) {
  try {
    await db
      .prepare(
        "INSERT INTO mailer_sent_emails (id, to_address, subject, status, resend_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        entry.to,
        entry.subject,
        entry.status,
        entry.resendId || null,
        entry.error || null,
        new Date().toISOString(),
      )
      .run();
  } catch (error) {
    console.error("Failed to log send to D1:", error);
  }
}

export default app;
