import { createHash, randomBytes } from "crypto";
import { createSupabaseServer } from "@/lib/supabase";

const EXCHANGE_TTL_MS = 120_000;

export function newExchangePlaintext(): string {
  return randomBytes(32).toString("base64url");
}

export function hashExchangeToken(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

export async function createExtensionExchange(userId: string): Promise<string> {
  const plain = newExchangePlaintext();
  const supabase = createSupabaseServer();
  const expiresAt = new Date(Date.now() + EXCHANGE_TTL_MS).toISOString();
  const { error } = await supabase.from("oauth_extension_exchange").insert({
    token_hash: hashExchangeToken(plain),
    user_id: userId,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  return plain;
}

/** Marks row consumed and returns user_id, or null if invalid/expired. */
export async function consumeExtensionExchange(
  plainToken: string,
): Promise<string | null> {
  const hash = hashExchangeToken(plainToken);
  const supabase = createSupabaseServer();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("oauth_extension_exchange")
    .update({ consumed_at: now })
    .eq("token_hash", hash)
    .is("consumed_at", null)
    .gte("expires_at", now)
    .select("user_id")
    .maybeSingle();

  if (error || !data?.user_id) return null;
  return data.user_id as string;
}
