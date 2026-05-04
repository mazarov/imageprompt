import { createSupabaseServer, isSupabaseServerConfigured } from "@/lib/supabase";
import { decodeGoogleIdTokenClaims } from "@/lib/app-auth-jwt";
import {
  appAuthUserError,
  authFlowDebug,
  serializeSupabaseError,
  serializeSupabaseErrorFull,
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

  const { data: upsertRows, error: upErr } = await supabase
    .from("imageprompt_users")
    .upsert(upsertPayload, { onConflict: "google_sub" })
    .select("id");

  if (upErr) {
    appAuthUserError("imageprompt_users_upsert_failed", {
      requestId,
      google_sub_len: googleSub.length,
      has_email: Boolean(email),
      supabase: serializeSupabaseErrorFull(upErr),
      hint: "PostgREST rejected upsert: table/columns, unique on google_sub, or key (use service_role JWT in SUPABASE_SERVICE_ROLE_KEY).",
    });
    throw new Error(upErr.message || "imageprompt_users upsert failed");
  }

  const rows = Array.isArray(upsertRows) ? upsertRows : [];
  let userId = rows[0]?.id as string | undefined;

  if (!userId) {
    const { data: found, error: selErr } = await supabase
      .from("imageprompt_users")
      .select("id")
      .eq("google_sub", googleSub)
      .maybeSingle();

    if (selErr) {
      appAuthUserError("imageprompt_users_select_after_upsert_failed", {
        requestId,
        google_sub_len: googleSub.length,
        supabase: serializeSupabaseErrorFull(selErr),
        upsert_returned_row_count: rows.length,
      });
      throw new Error(selErr.message || "imageprompt_users select failed");
    }
    userId = found?.id as string | undefined;
  }

  if (!userId) {
    appAuthUserError("imageprompt_users_upsert_failed", {
      requestId,
      google_sub_len: googleSub.length,
      has_email: Boolean(email),
      supabase: serializeSupabaseErrorFull(upErr),
      upsert_returned_row_count: rows.length,
      upsert_raw: rows.length ? JSON.stringify(rows).slice(0, 500) : null,
      hint: "No row after upsert: table missing (run docs/sql/03-04-imageprompt-users.sql), anon key instead of service_role, or RLS blocking reads/writes.",
    });
    throw new Error("imageprompt_users upsert failed");
  }

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

/**
 * Resolves imageprompt_users.id for DB writes. JWT `sub` should match that id; when the extension
 * keeps an old token after re-login, `sub` may be stale while `email` still matches the current row.
 */
export async function resolveImagepromptUserIdForApiWrite(params: {
  jwtSub: string;
  jwtEmail: string | null | undefined;
}): Promise<{ userId: string; repairedByEmail: boolean } | null> {
  if (!isSupabaseServerConfigured()) return null;
  const supabase = createSupabaseServer();

  const { data: byId, error: errById } = await supabase
    .from("imageprompt_users")
    .select("id")
    .eq("id", params.jwtSub)
    .maybeSingle();

  if (!errById && byId?.id) {
    return { userId: byId.id as string, repairedByEmail: false };
  }

  const rawEmail = typeof params.jwtEmail === "string" ? params.jwtEmail.trim() : "";
  if (!rawEmail) return null;

  const { data: rows, error: errEmail } = await supabase
    .from("imageprompt_users")
    .select("id")
    .ilike("email", rawEmail)
    .limit(5);

  if (errEmail || !rows?.length) return null;
  if (rows.length > 1) {
    console.error("[resolveImagepromptUserIdForApiWrite] ambiguous email in imageprompt_users", {
      jwtSub: params.jwtSub,
      rowCount: rows.length,
    });
    return null;
  }

  const userId = rows[0].id as string;
  if (userId === params.jwtSub) {
    return { userId, repairedByEmail: false };
  }
  console.warn("[resolveImagepromptUserIdForApiWrite] repaired stale jwt sub via email match", {
    jwtSub: params.jwtSub,
    resolvedUserId: userId,
  });
  return { userId, repairedByEmail: true };
}

/**
 * Ensures a billing row exists for this app user. Safe on duplicate.
 * Some deployments FK vibes.user_id (or other tables) to landing_users; OAuth flow inserts this,
 * but repairing here avoids extract failures if the row was missing.
 */
export async function ensureLandingUserStubRow(userId: string): Promise<void> {
  if (!isSupabaseServerConfigured()) return;
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("landing_users").insert({
    id: userId,
    credits: 0,
  });
  if (!error) return;
  const msg = error.message || "";
  if (msg.includes("duplicate") || msg.includes("23505")) return;
  console.warn("[ensureLandingUserStubRow] landing_users insert failed", {
    userId,
    message: msg,
  });
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
