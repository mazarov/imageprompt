import { NextResponse } from "next/server";
import { clearedCookie, sessionCookieName } from "@/lib/app-auth-cookies";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    ...clearedCookie(sessionCookieName()),
    path: "/",
  });
  return res;
}
