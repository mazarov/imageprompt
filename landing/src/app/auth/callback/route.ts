import { NextRequest, NextResponse } from "next/server";

/** Legacy Supabase OAuth callback; app auth uses `/auth/google/callback`. */
export async function GET(request: NextRequest) {
  const url = new URL("/", request.url);
  url.searchParams.set("auth_migrated", "1");
  return NextResponse.redirect(url);
}
