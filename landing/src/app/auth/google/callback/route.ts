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
  const origin = getOAuthPublicOrigin(request);
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const errorRedirect = (msg: string) =>
    redirectNoStore(`${origin}/?auth_error=${encodeURIComponent(msg)}`);

  const q = request.nextUrl.searchParams;
  const err = q.get("error_description") || q.get("error");
  if (err) {
    return errorRedirect(String(err));
  }

  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) {
    return errorRedirect("missing_code_or_state");
  }

  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const nextPath = request.cookies.get(OAUTH_NEXT_COOKIE)?.value || "/";
  const flow = request.cookies.get(OAUTH_FLOW_COOKIE)?.value || "";

  if (!cookieState || cookieState !== state) {
    return errorRedirect("invalid_oauth_state");
  }

  if (!clientId || !clientSecret) {
    return errorRedirect("oauth_not_configured");
  }

  const redirectUri = `${origin}/auth/google/callback`;

  let idToken: string;
  try {
    const tokens = await exchangeGoogleAuthorizationCode({
      code,
      redirectUri,
      clientId,
      clientSecret,
    });
    if (!tokens.id_token) {
      return errorRedirect("no_id_token");
    }
    idToken = tokens.id_token;
  } catch (e) {
    return errorRedirect(formatAuthStepError("oauth_token", e));
  }

  let user: { id: string; email: string | null; displayName: string | null; avatarUrl: string | null };
  try {
    const u = await upsertAppUserFromGoogleIdToken(idToken);
    user = {
      id: u.id,
      email: u.email,
      displayName: u.displayName ?? null,
      avatarUrl: u.avatarUrl ?? null,
    };
  } catch (e) {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "jwt_sign_failed";
    return errorRedirect(msg);
  }

  if (flow === "extension") {
    let plain: string;
    try {
      plain = await createExtensionExchange(user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "exchange_create_failed";
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
  return res;
}
