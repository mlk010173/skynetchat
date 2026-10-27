// Autenticação unificada das APIs públicas: chave "sk-..." (tabela api_keys)
// ou sessão de conta (token opaco) para testes do dono.
import { createClient } from "npm:@supabase/supabase-js@2";
import { contaDaSessao, svc } from "./sessao.ts";

export type Autorizado = {
  accountId: string;
  keyId: string | null;
  tier: string;
  role: string;
  via: "chave" | "sessao";
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-api-key, x-session, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...extra,
    },
  });

export { json };

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function chaveDoHeader(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const header = (req.headers.get("x-api-key") ?? "").trim();
  const bruta = header || bearer;
  return bruta.startsWith("sk-") ? bruta : "";
}

export async function autorizar(req: Request): Promise<Autorizado | null> {
  const chave = chaveDoHeader(req);
  if (chave) {
    const db = svc();
    const hash = await sha256Hex(chave);
    const { data } = await db
      .from("api_keys")
      .select("id, account_id, revoked")
      .eq("key_hash", hash)
      .maybeSingle();
    if (!data || data.revoked) return null;
    const { data: conta } = await db
      .from("accounts")
      .select("id, tier, role")
      .eq("id", data.account_id)
      .maybeSingle();
    if (!conta) return null;
    void db
      .from("api_keys")
      .update({ last_used: new Date().toISOString(), calls: (data as any).calls ?? undefined })
      .eq("id", data.id);
    return { accountId: conta.id, keyId: data.id, tier: conta.tier, role: conta.role, via: "chave" };
  }
  const conta = await contaDaSessao(req);
  if (conta) {
    return { accountId: conta.id, keyId: null, tier: conta.tier, role: conta.role, via: "sessao" };
  }
  return null;
}

export async function registrar(
  autor: Autorizado | null,
  rota: string,
  status: number,
  ms: number,
): Promise<void> {
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    await db.from("api_log").insert({
      account_id: autor?.accountId ?? null,
      key_id: autor?.keyId ?? null,
      rota,
      status,
      ms,
    });
  } catch (_) { /* log não pode derrubar a resposta */ }
}

export async function contadorDeChamadas(keyId: string | null): Promise<void> {
  if (!keyId) return;
  const db = svc();
  const { data } = await db.from("api_keys").select("calls").eq("id", keyId).maybeSingle();
  if (!data) return;
  await db.from("api_keys").update({ calls: (data.calls ?? 0) + 1, last_used: new Date().toISOString() }).eq("id", keyId);
}
