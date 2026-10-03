// Smoke CHI CHO DEV: goi POST /send de kiem lop bao ve (bearer + validate
// body). Khong request nao toi duoc Resend: tat ca dung o 401/400 truoc buoc
// gui. Van khong bao gio chay vao production; `pnpm e2e` chi chay voi local.
import { assert, assertLocalOnly, BASE, expectStatus, finish, request, test } from "@huyab/e2e";

assertLocalOnly();

const KEY = process.env.E2E_INTERNAL_API_KEY;
assert(KEY, "thieu E2E_INTERNAL_API_KEY (chay qua `pnpm e2e`)");

/** POST /send voi body tho va header tuy chon. */
function send(body, headers = {}) {
  return request("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

const bearer = { Authorization: `Bearer ${KEY}` };

console.log(`Dev smoke tai ${BASE}\n`);

await test("/send tu choi khi thieu bearer", async () => {
  const response = await send(JSON.stringify({ to: "a@example.com", subject: "x", text: "x" }));
  expectStatus(response, 401);
  assert((await response.json()).error === "unauthorized", "sai body 401");
});

await test("/send tu choi bearer sai", async () => {
  expectStatus(await send("{}", { Authorization: "Bearer wrong" }), 401);
});

await test("/send tu choi JSON hong", async () => {
  const response = await send("{not json", bearer);
  expectStatus(response, 400);
  assert((await response.json()).error === "invalid_json", "sai body 400");
});

await test("/send tu choi body thieu html|text", async () => {
  const response = await send(JSON.stringify({ to: "a@example.com", subject: "x" }), bearer);
  expectStatus(response, 400);
  assert((await response.json()).error === "expected { to, subject, html|text }", "sai body 400");
});

finish();
