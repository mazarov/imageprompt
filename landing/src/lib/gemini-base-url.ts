import type { SupabaseClient } from "@supabase/supabase-js";

export const GEMINI_DIRECT_BASE_URL = "https://generativelanguage.googleapis.com";

/**
 * Resolve Gemini API base URL: prefer GEMINI_PROXY_BASE_URL when
 * photo_app_config.gemini_use_proxy is on (default on), else direct Google API.
 */
export async function getGeminiBaseUrl(
  supabase: SupabaseClient,
): Promise<{ baseUrl: string; viaProxy: boolean }> {
  const proxyEnv = (process.env.GEMINI_PROXY_BASE_URL || "").replace(/\/+$/, "");

  try {
    const { data } = await supabase
      .from("photo_app_config")
      .select("value")
      .eq("key", "gemini_use_proxy")
      .maybeSingle();

    const raw = String(data?.value ?? "").trim().toLowerCase();
    const useProxy = raw === "" ? true : ["true", "1", "yes", "y", "on"].includes(raw);

    if (useProxy && proxyEnv) {
      return { baseUrl: proxyEnv, viaProxy: true };
    }
  } catch {
    if (proxyEnv) {
      return { baseUrl: proxyEnv, viaProxy: true };
    }
  }

  return { baseUrl: GEMINI_DIRECT_BASE_URL, viaProxy: false };
}
