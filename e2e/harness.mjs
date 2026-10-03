// Tiny assertion harness shared by the smoke suites: plain fetch against the
// Worker, no browser. E2E_BASE_URL picks the target (default: `pnpm dev`).

export const BASE = (process.env.E2E_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

let passed = 0;
let failed = 0;

/** Runs one named check; a failure is reported and counted, not thrown. */
export async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Fetches a path on the target without following redirects, so they can be asserted. */
export function request(path, init = {}) {
  return fetch(BASE + path, { redirect: "manual", ...init });
}

export function expectStatus(response, status) {
  assert(response.status === status, `${response.url}: expected ${status}, got ${response.status}`);
}

/** Prints the tally and exits non-zero when any check failed. */
export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
