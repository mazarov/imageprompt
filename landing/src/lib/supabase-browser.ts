import { createBrowserClient } from "@supabase/ssr";

export type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(url && key);
}

/** `null` when anon URL/key are missing (local dev without `.env.local`); production builds should set both. */
export function createSupabaseBrowser(): SupabaseBrowserClient | null {
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
