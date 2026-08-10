import { Hono } from "hono";
import { required, type Env } from "./env";
import { readSsoCookie, ssoLoginUrl, verifySsoToken } from "./sso";

const app = new Hono<{ Bindings: Env }>();

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Mot shell chung cho moi trang HTML (log, 401, 403, 404, 500) de CSS va
 * viewport meta khong lap lai o tung ham render. Mobile-first: khong co
 * bang cung nhat, cards xep doc tren man hinh nho, chi rong ra 2 cot khi
 * co du cho (min-width 640px).
 */
function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fafafa;
    --card: #ffffff;
    --border: #e5e5e5;
    --text: #1c1c1c;
    --muted: #6b7280;
    --accent: #4338ca;
    --ok: #16a34a;
    --fail: #dc2626;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111113;
      --card: #1a1a1d;
      --border: #2a2a2e;
      --text: #f2f2f2;
      --muted: #9a9aa2;
      --accent: #a5b4fc;
      --ok: #4ade80;
      --fail: #f87171;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    margin: 0;
    background: var(--bg);
    color: var(--text);
    -webkit-tap-highlight-color: transparent;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
  h1 { font-size: 1.125rem; font-weight: 600; margin: 0 0 1rem; }
  .empty { color: var(--muted); font-size: 0.9rem; padding: 2rem 0; text-align: center; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.875rem 1rem;
    margin-bottom: 0.625rem;
  }
  .row { display: flex; justify-content: space-between; gap: 0.75rem; align-items: baseline; }
  .to { font-weight: 600; font-size: 0.9rem; word-break: break-all; }
  .time { color: var(--muted); font-size: 0.75rem; white-space: nowrap; }
  .subject { font-size: 0.875rem; margin-top: 0.25rem; color: var(--text); }
  .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; gap: 0.5rem; }
  .badge {
    font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
    padding: 0.15rem 0.5rem; border-radius: 999px;
  }
  .badge.sent { color: var(--ok); background: color-mix(in srgb, var(--ok) 15%, transparent); }
  .badge.failed { color: var(--fail); background: color-mix(in srgb, var(--fail) 15%, transparent); }
  .id { font-size: 0.75rem; color: var(--muted); word-break: break-all; text-align: right; }
  .center-page {
    min-height: 100vh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; text-align: center; padding: 1.5rem; gap: 0.75rem;
  }
  .center-page .code { font-size: 2.5rem; font-weight: 700; color: var(--muted); }
  .center-page p { color: var(--muted); margin: 0; font-size: 0.9rem; }
  a.button {
    display: inline-block; margin-top: 0.5rem; padding: 0.6rem 1.25rem; border-radius: 0.5rem;
    background: var(--accent); color: white; text-decoration: none; font-size: 0.9rem; font-weight: 600;
  }
  @media (min-width: 640px) {
    .wrap { padding-top: 2rem; }
  }
</style>
</head>
<body>${body}</body>
</html>`;
}

function centerPage(code: string, message: string, action?: string): string {
  return shell(
    `${code} — mailer`,
    `<div class="center-page">
      <div class="code">${escapeHtml(code)}</div>
      <p>${escapeHtml(message)}</p>
      ${action || ""}
    </div>`,
  );
}

function renderLogsPage(rows: Record<string, unknown>[]): string {
  const cards = rows
    .map((row) => {
      const status = String(row.status);
      const idOrError = String(row.resend_id ?? row.error ?? "");
      return `<div class="card">
        <div class="row">
          <span class="to">${escapeHtml(String(row.to_address))}</span>
          <span class="time">${escapeHtml(String(row.created_at))}</span>
        </div>
        <div class="subject">${escapeHtml(String(row.subject))}</div>
        <div class="meta">
          <span class="badge ${status}">${escapeHtml(status)}</span>
          <span class="id">${escapeHtml(idOrError)}</span>
        </div>
      </div>`;
    })
    .join("\n");

  return shell(
    "mailer — nhật ký gửi email",
    `<div class="wrap">
      <h1>Nhật ký gửi email</h1>
      ${cards || '<div class="empty">Chưa có email nào.</div>'}
    </div>`,
  );
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
    return c.html(
      centerPage("401", "Cần đăng nhập để xem nhật ký gửi email.", `<a class="button" href="${loginUrl}">Đăng nhập</a>`),
      401,
    );
  }
  if (claims.email !== c.env.ADMIN_EMAIL) {
    return c.html(centerPage("403", "Tài khoản này không có quyền xem trang này."), 403);
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

/**
 * 404/500 chi anh huong duong duyet web (/, cac path la); /send van tra JSON
 * nhu truoc — cac app goi qua Service Binding khong doc trang HTML nay.
 */
app.notFound((c) =>
  c.html(centerPage("404", "Không có trang nào ở đây.", `<a class="button" href="/">Về trang chủ</a>`), 404),
);

app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return c.html(centerPage("500", "Có lỗi xảy ra, thử lại sau."), 500);
});

export default app;
