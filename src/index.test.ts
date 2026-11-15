import { describe, expect, it, vi } from "vitest";
import worker from "./index";

const SEND_URL = "https://mail.test/send";

function makeEnv(first: () => Promise<unknown>) {
  const prepare = vi.fn(() => ({ first }));
  const env = {
    DB: { prepare } as unknown as D1Database,
    DEFAULT_FROM: "mailer@example.test",
    INTERNAL_API_KEY: "test-key",
    SSO_ISSUER: "https://auth.example.test",
    ADMIN_EMAIL: "admin@example.test",
  };
  return { env, prepare };
}

describe("deploy-check routes", () => {
  it("serves the build info without a session", async () => {
    const { env, prepare } = makeEnv(async () => ({}));
    const response = await worker.fetch(new Request("https://mail.test/api/version"), env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["branch", "builtAt", "builtBy", "commit", "dirty", "shortCommit"].sort(),
    );
    expect(prepare).not.toHaveBeenCalled();
  });

  it("answers health when D1 works", async () => {
    const { env, prepare } = makeEnv(async () => ({ 1: 1 }));
    const response = await worker.fetch(new Request("https://mail.test/api/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(prepare).toHaveBeenCalledWith("SELECT 1");
  });

  it("answers 500 with a hint and no error text when D1 fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { env } = makeEnv(async () => {
      throw new Error("secret-db-detail");
    });
    const response = await worker.fetch(new Request("https://mail.test/api/health"), env);
    expect(response.status).toBe(500);
    const text = await response.text();
    const body = JSON.parse(text) as { ok: boolean; hint: string };
    expect(body.ok).toBe(false);
    expect(body.hint.length).toBeGreaterThan(0);
    expect(text).not.toContain("secret-db-detail");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not answer the routes for POST", async () => {
    const { env } = makeEnv(async () => ({}));
    const response = await worker.fetch(
      new Request("https://mail.test/api/health", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /send", () => {
  it("still answers 401 without the bearer", async () => {
    const { env } = makeEnv(async () => ({}));
    const response = await worker.fetch(new Request(SEND_URL, { method: "POST", body: "{}" }), env);
    expect(response.status).toBe(401);
  });

  it("still answers 401 with a wrong bearer", async () => {
    const { env } = makeEnv(async () => ({}));
    const response = await worker.fetch(
      new Request(SEND_URL, {
        method: "POST",
        headers: { Authorization: "Bearer nope" },
        body: "{}",
      }),
      env,
    );
    expect(response.status).toBe(401);
  });
});
