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

/** Shared step logs (callback + user upsert) when AUTH_CALLBACK_DEBUG=1 */
export function authFlowDebug(
  event: string,
  fields: Record<string, unknown>,
): void {
  if (!debugEnabled()) return;
  console.info(`[auth.flow] ${event}`, JSON.stringify(fields));
}
