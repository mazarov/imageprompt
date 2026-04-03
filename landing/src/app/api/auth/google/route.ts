import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_FLOW_COOKIE,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
} from "@/lib/app-auth-cookies";
import { getOAuthPublicOrigin, safeNextPath } from "@/lib/app-auth-site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "google_oauth_not_configured" },
      { status: 503 },
    );
  }

  const origin = getOAuthPublicOrigin(request);
  const redirectUri = `${origin}/auth/google/callback`;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const flow =
    request.nextUrl.searchParams.get("flow") === "extension" ? "extension" : "";
  const state = randomBytes(24).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl.toString());
  const opt = oauthStateCookieOptions(600);
  res.cookies.set(OAUTH_STATE_COOKIE, state, opt);
  res.cookies.set(OAUTH_NEXT_COOKIE, next, opt);
  res.cookies.set(OAUTH_FLOW_COOKIE, flow, opt);
  return res;
}
