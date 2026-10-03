// Chay ca bo E2E mot lenh: bat `wrangler dev` -> smoke chi doc -> smoke dev
// -> tat server. Khong can .dev.vars: INTERNAL_API_KEY cho local truyen qua
// --var, RESEND_API_KEY de trong vi khong test nao gui mail that.
//
// Bien moi truong:
// - E2E_PORT: cong cho wrangler dev (mac dinh 8792, tranh 8787 cua `pnpm dev`)
import { spawn } from "node:child_process";

const PORT = process.env.E2E_PORT || "8792";
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const E2E_INTERNAL_API_KEY = "e2e-local-internal-key";

/** Chay mot lenh den khi ket thuc; loi thi nem. */
function run(command, args, label, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} that bai (exit ${code})`)),
    );
  });
}

/** Doi server tra loi favicon, hoac nem khi qua han. */
async function waitForServer(child) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev tat som (exit ${child.exitCode})`);
    try {
      if ((await fetch(`${BASE}/favicon.svg`)).ok) return;
    } catch {
      // Server chua san sang, thu lai.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`wrangler dev khong len sau ${SERVER_TIMEOUT_MS}ms`);
}

const server = spawn(
  "pnpm",
  [
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
  { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, CI: "1" }, detached: true },
);

/** Bao ca process group cua server; group da tat roi thi bo qua. */
function stopServer(signal) {
  try {
    process.kill(-server.pid, signal);
  } catch {
    // Da tat.
  }
}

// Ctrl-C cung khong duoc de wrangler giu cong.
process.on("SIGINT", () => {
  stopServer("SIGKILL");
  process.exit(130);
});

let failed = false;
try {
  await waitForServer(server);
  console.log(`\nServer san sang tai ${BASE}\n`);
  const env = { ...process.env, E2E_BASE_URL: BASE, E2E_INTERNAL_API_KEY };
  await run("node", ["e2e/readonly-smoke.mjs"], "smoke chi doc", env);
  await run("node", ["e2e/dev-smoke.mjs"], "smoke dev", env);
} catch (error) {
  failed = true;
  console.error("E2E FAIL:", error.message);
} finally {
  // pnpm -> wrangler -> workerd: bao ca process group (server spawn detached),
  // khong thi chau chat song sot sau script nay va giu cong.
  stopServer("SIGTERM");
  // Cho wrangler don dep; qua han thi ket lieu de process khong treo.
  const stopped = await Promise.race([
    new Promise((resolve) => server.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!stopped) stopServer("SIGKILL");
}

process.exit(failed ? 1 : 0);
