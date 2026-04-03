import { NextRequest, NextResponse } from "next/server";
import { signAppSessionToken } from "@/lib/app-auth-jwt";
import { consumeExtensionExchange } from "@/lib/app-auth-extension-exchange";
import { getImagepromptProfileForSession } from "@/lib/app-auth-user";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  const userId = await consumeExtensionExchange(code);
  if (!userId) {
    return NextResponse.json({ error: "invalid_or_expired_code" }, { status: 401 });
  }

  const profile = await getImagepromptProfileForSession(userId);
  let accessToken: string;
  try {
    accessToken = await signAppSessionToken({
      sub: userId,
      email: profile.email,
      name: profile.display_name,
      picture: profile.avatar_url,
    });
  } catch {
    return NextResponse.json({ error: "token_sign_failed" }, { status: 500 });
  }

  return NextResponse.json(
    { accessToken },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
