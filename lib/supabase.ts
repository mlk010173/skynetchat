import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Permite build mesmo sem env configurado; em runtime sem env, o login fica desabilitado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (process.env.NODE_ENV === "development") {
    console.warn("SKYHUB: variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não configuradas.");
  }
}

export function getSupabase() {
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}
