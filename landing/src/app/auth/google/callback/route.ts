import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_FLOW_COOKIE,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  clearedCookie,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/app-auth-cookies";
import { exchangeGoogleAuthorizationCode } from "@/lib/app-auth-google";
import { signAppSessionToken, authJwtExpiresSeconds } from "@/lib/app-auth-jwt";
import { getOAuthPublicOrigin } from "@/lib/app-auth-site";
import { upsertAppUserFromGoogleIdToken } from "@/lib/app-auth-user";
import { createExtensionExchange } from "@/lib/app-auth-extension-exchange";
import {
  oauthCallbackDebug,
  oauthCallbackError,
} from "@/lib/app-auth-oauth-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function redirectNoStore(url: string): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Vary", "Cookie");
  return response;
}

function clearOAuthCookies(res: NextResponse): void {
  const path = { path: "/" as const };
  res.cookies.set({ ...clearedCookie(OAUTH_STATE_COOKIE), ...path });
  res.cookies.set({ ...clearedCookie(OAUTH_NEXT_COOKIE), ...path });
  res.cookies.set({ ...clearedCookie(OAUTH_FLOW_COOKIE), ...path });
}

/** Surfaces undici `cause` chain (e.g. ENOTFOUND, ECONNREFUSED) for ops debugging. */
function formatAuthStepError(step: string, e: unknown): string {
  if (!(e instanceof Error)) return `${step}:unknown`;
  const parts: string[] = [e.message];
  let c: unknown = e.cause;
  for (let d = 0; d < 4 && c instanceof Error; d++) {
    parts.push(c.message);
    c = c.cause;
  }
  return `${step}:${parts.join(" | ")}`;
}

export async function GET(request: NextRequest) {
  const requestId = randomBytes(8).toString("hex");
  const origin = getOAuthPublicOrigin(request);
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const errorRedirect = (msg: string) =>
    redirectNoStore(`${origin}/?auth_error=${encodeURIComponent(msg)}`);

  const q = request.nextUrl.searchParams;
  oauthCallbackDebug("hit", {
    requestId,
    origin,
    hasGoogleError: Boolean(q.get("error") || q.get("error_description")),
  });

  const err = q.get("error_description") || q.get("error");
  if (err) {
    oauthCallbackError("google_query_error", { requestId, err: String(err) });
    return errorRedirect(String(err));
  }

  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) {
    oauthCallbackError("missing_code_or_state", { requestId });
    return errorRedirect("missing_code_or_state");
  }

  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const nextPath = request.cookies.get(OAUTH_NEXT_COOKIE)?.value || "/";
  const flow = request.cookies.get(OAUTH_FLOW_COOKIE)?.value || "";

  if (!cookieState || cookieState !== state) {
    oauthCallbackError("invalid_oauth_state", {
      requestId,
      state_match: false,
    });
    return errorRedirect("invalid_oauth_state");
  }

  oauthCallbackDebug("state_ok", { requestId, flow, nextPath_len: nextPath.length });

  if (!clientId || !clientSecret) {
    oauthCallbackError("oauth_not_configured", { requestId });
    return errorRedirect("oauth_not_configured");
  }

  const redirectUri = `${origin}/auth/google/callback`;
  oauthCallbackDebug("token_exchange_start", { requestId, redirectUri });

  let idToken: string;
  try {
    const tokens = await exchangeGoogleAuthorizationCode({
      code,
      redirectUri,
      clientId,
      clientSecret,
    });
    if (!tokens.id_token) {
      oauthCallbackError("no_id_token", { requestId, token_keys: Object.keys(tokens) });
      return errorRedirect("no_id_token");
    }
    idToken = tokens.id_token;
    oauthCallbackDebug("token_exchange_ok", {
      requestId,
      id_token_len: idToken.length,
    });
  } catch (e) {
    oauthCallbackError("token_exchange_failed", {
      requestId,
      error: formatAuthStepError("oauth_token", e),
    });
    return errorRedirect(formatAuthStepError("oauth_token", e));
  }

  oauthCallbackDebug("user_upsert_start", { requestId });

  let user: { id: string; email: string | null; displayName: string | null; avatarUrl: string | null };
  try {
    const u = await upsertAppUserFromGoogleIdToken(idToken, { requestId });
    user = {
      id: u.id,
      email: u.email,
      displayName: u.displayName ?? null,
      avatarUrl: u.avatarUrl ?? null,
    };
    oauthCallbackDebug("user_upsert_ok", { requestId, user_id: user.id });
  } catch (e) {
    oauthCallbackError("user_upsert_failed", {
      requestId,
      error: formatAuthStepError("user_db", e),
    });
    return errorRedirect(formatAuthStepError("user_db", e));
  }

  let jwt: string;
  try {
    jwt = await signAppSessionToken({
      sub: user.id,
      email: user.email,
      name: user.displayName,
      picture: user.avatarUrl,
    });
    oauthCallbackDebug("jwt_signed", { requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "jwt_sign_failed";
    oauthCallbackError("jwt_sign_failed", { requestId, msg });
    return errorRedirect(msg);
  }

  if (flow === "extension") {
    let plain: string;
    try {
      plain = await createExtensionExchange(user.id);
      oauthCallbackDebug("extension_exchange_row_ok", { requestId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "exchange_create_failed";
      oauthCallbackError("extension_exchange_failed", { requestId, msg });
      return errorRedirect(msg);
    }
    const finish = new URL("/auth/extension/finish", origin);
    finish.searchParams.set("c", plain);
    const res = redirectNoStore(finish.toString());
    clearOAuthCookies(res);
    return res;
  }

  const target = new URL(nextPath, origin);
  const res = redirectNoStore(target.toString());
  clearOAuthCookies(res);
  res.cookies.set(sessionCookieName(), jwt, sessionCookieOptions(authJwtExpiresSeconds()));
  oauthCallbackDebug("redirect_web_session", { requestId, target: target.pathname });
  return res;
}
