import { createSupabaseServer, isSupabaseServerConfigured } from "@/lib/supabase";
import { decodeGoogleIdTokenClaims } from "@/lib/app-auth-jwt";
import {
  appAuthUserError,
  authFlowDebug,
  serializeSupabaseError,
} from "@/lib/app-auth-oauth-log";

/**
 * Upsert imageprompt_users by google_sub; ensure landing_users row exists with same id (credits).
 */
export async function upsertAppUserFromGoogleIdToken(
  idToken: string,
  context?: { requestId?: string },
): Promise<{
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}> {
  const requestId = context?.requestId ?? "no-req-id";
  const claims = decodeGoogleIdTokenClaims(idToken);
  const googleSub = claims?.sub;
  if (!googleSub) {
    appAuthUserError("claims_missing_sub", { requestId });
    throw new Error("id_token missing sub");
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  const emailVerified =
    typeof claims.email_verified === "boolean" ? claims.email_verified : null;
  const displayName = typeof claims.name === "string" ? claims.name : null;
  const avatarUrl = typeof claims.picture === "string" ? claims.picture : null;
  const now = new Date().toISOString();

  if (!isSupabaseServerConfigured()) {
    appAuthUserError("supabase_not_configured", { requestId });
    throw new Error("supabase_not_configured");
  }

  const supabase = createSupabaseServer();

  const upsertPayload = {
    google_sub: googleSub,
    email,
    email_verified: emailVerified,
    display_name: displayName,
    avatar_url: avatarUrl,
    updated_at: now,
    last_login_at: now,
  };

  authFlowDebug("imageprompt_users_upsert_start", {
    requestId,
    onConflict: "google_sub",
  });

  const { data: upserted, error: upErr } = await supabase
    .from("imageprompt_users")
    .upsert(upsertPayload, { onConflict: "google_sub" })
    .select("id")
    .single();

  if (upErr || !upserted?.id) {
    appAuthUserError("imageprompt_users_upsert_failed", {
      requestId,
      google_sub_len: googleSub.length,
      has_email: Boolean(email),
      supabase: serializeSupabaseError(upErr),
      data_present: Boolean(upserted),
      data_id: upserted?.id ?? null,
      hint: "Check table exists (docs/sql/03-04-imageprompt-users.sql), unique on google_sub, service role key, RLS off or bypass.",
    });
    throw new Error(upErr?.message || "imageprompt_users upsert failed");
  }

  const userId = upserted.id as string;

  authFlowDebug("imageprompt_users_upsert_ok", { requestId, userId });

  const { error: luErr } = await supabase.from("landing_users").insert({
    id: userId,
    credits: 0,
  });

  if (luErr) {
    const msg = luErr.message || "";
    if (!msg.includes("duplicate") && !msg.includes("23505")) {
      appAuthUserError("landing_users_insert_failed", {
        requestId,
        user_id: userId,
        supabase: serializeSupabaseError(luErr),
      });
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
