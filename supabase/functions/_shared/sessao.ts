// Sessão do novo login por código secreto (tabela acc_sessions).
// Usada pelas funções que precisam saber quem é a conta sem depender do Supabase Auth.
import { createClient } from "npm:@supabase/supabase-js@2";

export type Conta = {
  id: string;
  tier: string;
  role: string;
  nickname: string | null;
  recovery_email: string | null;
  created_at?: string;
  last_seen?: string | null;
  visits?: number;
};

export const svc = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

/** Devolve a conta dona do token de sessão, ou null. */
export async function contaDaSessao(req: Request): Promise<Conta | null> {
  const token =
    req.headers.get("x-session") ??
    (req.headers.get("authorization")?.match(/^Bearer\s+([0-9a-f]{64})$/i)?.[1]) ??
    "";
  if (!token || token.length < 32) return null;
  const db = svc();
  const { data: sess } = await db
    .from("acc_sessions")
    .select("account_id, revoked")
    .eq("token", token)
    .maybeSingle();
  if (!sess || sess.revoked) return null;
  const { data: conta } = await db
    .from("accounts")
    .select("id, tier, role, nickname, recovery_email, created_at, last_seen, visits, blocked")
    .eq("id", sess.account_id)
    .maybeSingle();
  if (!conta || (conta as any).blocked) return null;
  return (conta as Conta) ?? null;
}

/** Limite diário de mensagens por plano. */
export const limiteDiario = (tier: string) =>
  tier === "pro" ? 400 : tier === "admin" ? 2000 : 40;

/** Conta dona de um usuário do Supabase Auth (login por e-mail/senha). */
export async function contaPorAuthUserId(
  authUserId: string,
): Promise<{ id: string; tier: string; role: string | null; bloqueada: boolean } | null> {
  const db = svc();
  const { data } = await db
    .from("accounts")
    .select("id, tier, role, blocked")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    tier: (data.tier as string) ?? "free",
    role: (data.role as string) ?? null,
    bloqueada: data.blocked === true,
  };
}

/**
 * Soma 1 no uso do dia e diz se ainda pode conversar.
 * Atômico (RPC acc_consumir_mensagem) e fail-closed: se o banco não responder,
 * a mensagem é negada em vez de liberada de graça.
 */
export async function consumirMensagem(accountId: string, tier: string) {
  const db = svc();
  const dia = new Date().toISOString().slice(0, 10);
  const limite = limiteDiario(tier);
  const { data, error } = await db.rpc("acc_consumir_mensagem", {
    p_account_id: accountId,
    p_dia: dia,
    p_limite: limite,
  });
  if (error || typeof data !== "number") {
    console.error("[acc_uso] falha ao contabilizar", {
      account_id: accountId,
      dia,
      erro: error?.message ?? "resposta inesperada",
    });
    return { pode: false, usado: limite, limite };
  }
  return { pode: data <= limite, usado: data, limite };
}

/** Memórias da conta formatadas para entrar no prompt do sistema. */
export async function memoriasDaConta(accountId: string, limite = 20): Promise<string[]> {
  const db = svc();
  const { data } = await db
    .from("acc_memory")
    .select("chave, valor, tipo")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(limite);
  return (data ?? []).map((m: { chave: string; valor: string; tipo: string }) =>
    `${m.chave}: ${m.valor}`.slice(0, 300)
  );
}
