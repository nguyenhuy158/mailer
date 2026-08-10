export interface Env {
  /** Resend API key, set with: wrangler secret put RESEND_API_KEY */
  RESEND_API_KEY?: string;
  /** Default From header when a caller doesn't specify one. */
  DEFAULT_FROM: string;
  /**
   * Shared secret checked on every request, in addition to this Worker having
   * no public route (see wrangler.jsonc: workers_dev is off). Two independent
   * layers because a route/binding can be misconfigured; a secret nobody
   * outside this account holds still stops that from being an open relay.
   */
  INTERNAL_API_KEY?: string;
}

export function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not configured. Set it with: wrangler secret put ${name}`);
  }
  return value;
}
