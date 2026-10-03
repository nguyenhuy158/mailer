// Chay ca bo E2E mot lenh: bat `wrangler dev` -> smoke chi doc -> smoke dev
// -> tat server. Khong can .dev.vars: INTERNAL_API_KEY cho local truyen qua
// --var, RESEND_API_KEY de trong vi khong test nao gui mail that.
//
// Bien moi truong:
// - E2E_PORT: cong cho wrangler dev (mac dinh 8792, tranh 8787 cua `pnpm dev`)
import { run, startServer } from "@huyab/e2e";

const PORT = process.env.E2E_PORT || "8792";
const BASE = `http://127.0.0.1:${PORT}`;
const E2E_INTERNAL_API_KEY = "e2e-local-internal-key";

let failed = false;
let server;
try {
  server = await startServer({
    command: "pnpm",
    args: [
      "exec",
      "wrangler",
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      PORT,
      "--var",
      `INTERNAL_API_KEY:${E2E_INTERNAL_API_KEY}`,
    ],
    readyUrl: `${BASE}/favicon.svg`,
  });
  console.log(`\nServer san sang tai ${BASE}\n`);
  const env = { E2E_BASE_URL: BASE, E2E_INTERNAL_API_KEY };
  await run("node", ["e2e/readonly-smoke.mjs"], { label: "smoke chi doc", env });
  await run("node", ["e2e/dev-smoke.mjs"], { label: "smoke dev", env });
} catch (error) {
  failed = true;
  console.error("E2E FAIL:", error.message);
} finally {
  await server?.stop();
}

process.exit(failed ? 1 : 0);
