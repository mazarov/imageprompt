import { createSupabaseServer } from "@/lib/supabase";
import { decodeGoogleIdTokenClaims } from "@/lib/app-auth-jwt";

/**
 * Upsert imageprompt_users by google_sub; ensure landing_users row exists with same id (credits).
 */
export async function upsertAppUserFromGoogleIdToken(
  idToken: string,
): Promise<{
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}> {
  const claims = decodeGoogleIdTokenClaims(idToken);
  const googleSub = claims?.sub;
  if (!googleSub) {
    throw new Error("id_token missing sub");
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  const emailVerified =
    typeof claims.email_verified === "boolean" ? claims.email_verified : null;
  const displayName = typeof claims.name === "string" ? claims.name : null;
  const avatarUrl = typeof claims.picture === "string" ? claims.picture : null;
  const now = new Date().toISOString();

  const supabase = createSupabaseServer();

  const { data: upserted, error: upErr } = await supabase
    .from("imageprompt_users")
    .upsert(
      {
        google_sub: googleSub,
        email,
        email_verified: emailVerified,
        display_name: displayName,
        avatar_url: avatarUrl,
        updated_at: now,
        last_login_at: now,
      },
      { onConflict: "google_sub" },
    )
    .select("id")
    .single();

  if (upErr || !upserted?.id) {
    throw new Error(upErr?.message || "imageprompt_users upsert failed");
  }

  const userId = upserted.id as string;

  const { error: luErr } = await supabase.from("landing_users").insert({
    id: userId,
    credits: 0,
  });

  if (luErr) {
    const msg = luErr.message || "";
    if (!msg.includes("duplicate") && !msg.includes("23505")) {
      throw new Error(luErr.message);
    }
  }

  return {
    id: userId,
    email,
    displayName: displayName,
    avatarUrl: avatarUrl,
  };
}

export async function getImagepromptProfileForSession(userId: string): Promise<{
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("imageprompt_users")
    .select("email, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { email: null, display_name: null, avatar_url: null };
  }
  const row = data as {
    email?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  };
  return {
    email: row.email ?? null,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
  };
}
