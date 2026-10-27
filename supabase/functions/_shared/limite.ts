// Limitador simples por chave (IP, conta ou chave de API) apoiado no Postgres.
// Uso: const livre = await liberar("login:1.2.3.4", 20, "hour");
import { createClient } from "npm:@supabase/supabase-js@2";

const db = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

export function ipDe(req: Request): string {
  const f = req.headers.get("x-forwarded-for") ?? "";
  return (f.split(",")[0] || req.headers.get("cf-connecting-ip") || "desconhecido").trim().slice(0, 60);
}

/** true = pode passar; false = estourou o limite da janela. */
export async function liberar(chave: string, limite: number, janela: "minute" | "hour" | "day"): Promise<boolean> {
  try {
    const svc = db();
    const { data, error } = await svc.rpc("rate_bater", { p_chave: chave, p_janela: janela });
    if (error || typeof data !== "number") return true; // falha aberta só para não derrubar o serviço
    return data <= limite;
  } catch (_) {
    return true;
  }
}

/** Devolve quantas batidas já houve na janela (sem incrementar). */
export async function batidas(chave: string, janela: "minute" | "hour" | "day"): Promise<number> {
  try {
    const svc = db();
    const { data } = await svc.rpc("rate_contar", { p_chave: chave, p_janela: janela });
    return typeof data === "number" ? data : 0;
  } catch (_) { return 0; }
}

export const respostaLimite = (extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Espere um pouco e tente de novo." }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Retry-After": "120",
      ...extra,
    },
  });
