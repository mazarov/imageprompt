/**
 * Structured logs for Google OAuth callback / user upsert (server only).
 * Set AUTH_CALLBACK_DEBUG=1 for per-step info logs; errors always log full detail.
 */

function debugEnabled(): boolean {
  const v = process.env.AUTH_CALLBACK_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function safeSupabaseError(err: {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
} | null): Record<string, unknown> {
  if (!err) return {};
  return {
    message: err.message,
    code: err.code,
    details: err.details ?? undefined,
    hint: err.hint ?? undefined,
  };
}

export function oauthCallbackDebug(
  event: string,
  fields: Record<string, unknown>,
): void {
  if (!debugEnabled()) return;
  console.info(`[oauth.callback] ${event}`, JSON.stringify(fields));
}

export function oauthCallbackError(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.error(`[oauth.callback] ${event}`, JSON.stringify(fields));
}

export function appAuthUserError(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.error(`[app-auth.user] ${event}`, JSON.stringify(fields));
}

export function serializeSupabaseError(
  err: {
    message?: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
  } | null,
): Record<string, unknown> {
  return safeSupabaseError(err);
}

/** Full dump for PostgREST / Supabase client errors (non-enumerable-safe). */
export function serializeSupabaseErrorFull(err: unknown): Record<string, unknown> {
  if (err === null || err === undefined) {
    return { present: false };
  }
  if (typeof err !== "object") {
    return { present: true, primitive: String(err) };
  }
  const o = err as Record<string, unknown>;
  const base = {
    present: true,
    message: typeof o.message === "string" ? o.message : undefined,
    code: typeof o.code === "string" ? o.code : undefined,
    details: o.details ?? undefined,
    hint: typeof o.hint === "string" ? o.hint : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
  };
  let extra = "";
  try {
    extra = JSON.stringify(err, Object.getOwnPropertyNames(err as object));
  } catch {
    extra = "";
  }
  return { ...base, json_own: extra || undefined };
}

/** Shared step logs (callback + user upsert) when AUTH_CALLBACK_DEBUG=1 */
export function authFlowDebug(
  event: string,
  fields: Record<string, unknown>,
): void {
  if (!debugEnabled()) return;
  console.info(`[auth.flow] ${event}`, JSON.stringify(fields));
}
