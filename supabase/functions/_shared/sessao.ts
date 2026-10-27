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

/** Soma 1 no uso do dia e diz se ainda pode conversar. */
export async function consumirMensagem(accountId: string, tier: string) {
  const db = svc();
  const dia = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("acc_uso")
    .select("mensagens")
    .eq("account_id", accountId)
    .eq("dia", dia)
    .maybeSingle();
  const atual = Number(data?.mensagens ?? 0);
  const limite = limiteDiario(tier);
  if (atual >= limite) return { pode: false, usado: atual, limite };
  await db.from("acc_uso").upsert(
    { account_id: accountId, dia, mensagens: atual + 1 },
    { onConflict: "account_id,dia" },
  );
  return { pode: true, usado: atual + 1, limite };
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
