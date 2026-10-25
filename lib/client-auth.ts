import { createClient, Session, SupabaseClient } from "@supabase/supabase-js";

export type SessionLike = Session;

let client: SupabaseClient | null = null;

/** Cliente Supabase do browser (singleton). Retorna null se o Supabase não estiver configurado. */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
