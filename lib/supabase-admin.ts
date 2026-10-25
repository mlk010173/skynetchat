import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Cliente administrativo do servidor (service role).
 * Usado SOMENTE nas rotas de API do servidor, nunca no browser.
 */
export function getSupabaseAdmin() {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Valida o token de acesso do usuário e devolve o id do usuário autenticado. */
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}
