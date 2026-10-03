// Smoke CHI DOC: chi GET, khong goi /send, khong ghi gi. An toan de chay vao
// production (`pnpm e2e:prod`, mail.huyab.click); `pnpm e2e` chay no truoc
// voi server local de dev va prod dung chung mot bo kiem tra.
import { assert, BASE, expectStatus, finish, request, test } from "./harness.mjs";

const SSO_LOGIN = "https://auth.huyab.click/login?redirect_uri=";

console.log(`Read-only smoke tai ${BASE}\n`);

await test("trang log doi dang nhap SSO", async () => {
  const response = await request("/");
  expectStatus(response, 401);
  const html = await response.text();
  assert(html.includes("Cần đăng nhập để xem nhật ký gửi email."), "thieu thong bao 401");
  assert(html.includes(`href="${SSO_LOGIN}`), "thieu link dang nhap SSO");
  assert(!html.includes("Nhật ký gửi email</h1>"), "lo trang log khi chua dang nhap");
});

await test("favicon la SVG", async () => {
  const response = await request("/favicon.svg");
  expectStatus(response, 200);
  assert(response.headers.get("content-type")?.startsWith("image/svg+xml"), "sai content type");
  assert((await response.text()).startsWith("<svg"), "body khong phai SVG");
});

await test("path la tra trang 404", async () => {
  const response = await request("/e2e-no-such-page");
  expectStatus(response, 404);
  assert((await response.text()).includes("Không có trang nào ở đây."), "thieu trang 404");
});

await test("GET /send khong ton tai (chi POST)", async () => {
  expectStatus(await request("/send"), 404);
});

finish();
