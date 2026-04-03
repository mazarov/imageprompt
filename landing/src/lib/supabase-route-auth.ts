import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sessionCookieName } from "@/lib/app-auth-cookies";
import { verifyAppSessionToken } from "@/lib/app-auth-jwt";

function dummySupabaseAuth(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon";
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toCompatUser(v: {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}): User {
  return {
    id: v.sub,
    email: v.email ?? undefined,
    user_metadata: {
      full_name: v.name ?? undefined,
      name: v.name ?? undefined,
      avatar_url: v.picture ?? undefined,
    },
    app_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

/**
 * Route Handler auth: Bearer app JWT (extension) or httpOnly session cookie (site).
 */
export async function getSupabaseUserForApiRoute(request: NextRequest): Promise<{
  user: User | null;
  error: Error | null;
  supabaseAuth: SupabaseClient;
}> {
  const dummy = dummySupabaseAuth();
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const rawToken = bearer || request.cookies.get(sessionCookieName())?.value;
  if (!rawToken) {
    return { user: null, error: null, supabaseAuth: dummy };
  }

  const v = await verifyAppSessionToken(rawToken);
  if (!v) {
    return { user: null, error: null, supabaseAuth: dummy };
  }

  return {
    user: toCompatUser(v),
    error: null,
    supabaseAuth: dummy,
  };
}

/** Server Components: session from cookies only. */
export async function getSupabaseUserFromServerCookies(): Promise<User | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(sessionCookieName())?.value;
  if (!raw) return null;
  const v = await verifyAppSessionToken(raw);
  if (!v) return null;
  return toCompatUser(v);
}
