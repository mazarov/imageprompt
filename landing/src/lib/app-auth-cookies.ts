import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const OAUTH_STATE_COOKIE = "ip_oauth_state";
export const OAUTH_NEXT_COOKIE = "ip_oauth_next";
export const OAUTH_FLOW_COOKIE = "ip_oauth_flow";

export function sessionCookieName(): string {
  return process.env.AUTH_SESSION_COOKIE_NAME?.trim() || "ip_session";
}

function secureDefault(): boolean {
  return process.env.NODE_ENV === "production";
}

export function oauthStateCookieOptions(maxAgeSec: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: secureDefault(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function sessionCookieOptions(maxAgeSec: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: secureDefault(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function clearedCookie(name: string): { name: string; value: string; maxAge: 0 } {
  return { name, value: "", maxAge: 0 };
}
