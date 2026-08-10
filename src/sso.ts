// Xac thuc cookie SSO cua auth.huyab.click, cung pattern voi chia-keo/shopee-tracker.
// Chi dung de bao ve trang xem log (GET /), khong lien quan /send.

const COOKIE_NAME = "huyab_sso";
const EXPECTED_AUD = "huyab.click";

export type SsoClaims = {
  iss: string;
  sub: string;
  aud: string;
  email: string;
  name?: string;
  exp: number;
};

const keyCacheByKid = new Map<string, CryptoKey>();

async function publicKey(issuer: string, kid: string | undefined): Promise<CryptoKey> {
  if (kid && keyCacheByKid.has(kid)) return keyCacheByKid.get(kid)!;

  const response = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!response.ok) throw new Error("jwks_unavailable");
  const { keys } = (await response.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  if (!keys?.length) throw new Error("jwks_empty");

  const jwk = kid ? keys.find((k) => k.kid === kid) : keys[0];
  if (!jwk) throw new Error("jwks_kid_not_found");

  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (jwk.kid) keyCacheByKid.set(jwk.kid, key);
  return key;
}

function decodeBase64Url(part: string): Uint8Array {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "=")), (c) =>
    c.charCodeAt(0),
  );
}

export function readSsoCookie(headers: Headers): string | null {
  return headers.get("Cookie")?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1] || null;
}

export async function verifySsoToken(issuer: string, token: string): Promise<SsoClaims | null> {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const headerData = JSON.parse(new TextDecoder().decode(decodeBase64Url(header))) as {
      alg?: string;
      kid?: string;
    };
    if (headerData.alg !== "RS256") return null;

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await publicKey(issuer, headerData.kid),
      decodeBase64Url(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as SsoClaims;
    if (claims.iss !== issuer) return null;
    if (claims.aud !== EXPECTED_AUD) return null;
    if (!claims.exp || claims.exp <= Date.now() / 1000) return null;
    if (!claims.sub || !claims.email) return null;

    return claims;
  } catch {
    return null;
  }
}

export function ssoLoginUrl(issuer: string, returnTo: string): string {
  return `${issuer}/login?redirect_uri=${encodeURIComponent(returnTo)}`;
}
