import { NextResponse } from "next/server";

/**
 * Legacy: extension used Supabase anon from here for Auth.
 * Auth is app JWT + Google OAuth; extension no longer needs this for login.
 */
export async function GET() {
  return NextResponse.json({
    auth: "app_jwt",
  });
}
