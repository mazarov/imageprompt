import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase";
import { getSupabaseUserForApiRoute } from "@/lib/supabase-route-auth";

export async function GET(request: NextRequest) {
  try {
    const {
      user,
      error: authError,
    } = await getSupabaseUserForApiRoute(request);

    if (authError || !user) {
      return NextResponse.json({ user: null, credits: 0 });
    }

    const supabase = createSupabaseServer();
    const { data: profile } = await supabase
      .from("landing_users")
      .select("credits")
      .eq("id", user.id)
      .single();

    const credits = (profile as { credits?: number } | null)?.credits ?? 0;

    const { data: ipRow, error: ipErr } = await supabase
      .from("imageprompt_users")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    let fullName: string | undefined;
    let avatarUrl: string | undefined;
    if (!ipErr && ipRow) {
      const ip = ipRow as {
        display_name?: string | null;
        avatar_url?: string | null;
      };
      fullName = ip.display_name ?? undefined;
      avatarUrl = ip.avatar_url ?? undefined;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? null,
        user_metadata: {
          full_name: fullName,
          name: fullName,
          avatar_url: avatarUrl,
        },
      },
      credits,
    });
  } catch (err) {
    console.error("me error:", err);
    return NextResponse.json({ user: null, credits: 0 });
  }
}
