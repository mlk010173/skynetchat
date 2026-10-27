// Edge Function: agent — ponte segura entre o navegador e o agente do Render.
// O AGENT_TOKEN nunca vai para o frontend: quem fala com o Render é esta função.
// Também é aqui que o "modo agente" (4.5 PRO) executa terminal/sandbox.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Só estas ferramentas podem ser chamadas pelo navegador.
// "terminal" fica fora da lista comum: só roda para quem está no modo PRO e autenticado.
const TOOLS_LIVRES = new Set([
  "web_pesquisar",
  "abrir",
  "imagem",
  "calcular",
  "hora",
  "clima",
  "moeda",
  "memoria_salvar",
  "memoria_buscar",
  "perguntar",
]);
const TOOLS_PRO = new Set(["terminal"]);

const service = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não suportado." }, 405);

  const base = (Deno.env.get("AGENT_URL") ?? "https://skynet-agent.onrender.com").replace(/\/+$/, "");
  const token = Deno.env.get("AGENT_TOKEN");
  if (!token) return json({ ok: false, configured: false, error: "AGENT_TOKEN não configurado." }, 503);

  let body: { tool?: string; payload?: Record<string, unknown>; modo?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Corpo inválido." }, 400);
  }

  const tool = String(body.tool ?? "").trim();
  if (!TOOLS_LIVRES.has(tool) && !TOOLS_PRO.has(tool)) {
    return json({ ok: false, error: `Ferramenta não permitida: ${tool || "(vazia)"}.` }, 400);
  }

  // Identidade: terminal exige usuário logado.
  const svc = service();
  let userId: string | null = null;
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ") && auth.length > 30) {
    const { data } = await svc.auth.getUser(auth.slice(7));
    userId = data?.user?.id ?? null;
  }
  if (TOOLS_PRO.has(tool) && !userId) {
    return json({ ok: false, error: "Terminal disponível só para usuários logados no modo PRO." }, 401);
  }

  const payload = (body.payload && typeof body.payload === "object") ? body.payload : {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
    const r = await fetch(`${base}/tools/${tool}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...(userId ? { "X-Skynet-User": userId } : {}),
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const dados = await r.json().catch(() => null);
    if (!r.ok) return json({ ok: false, error: `Agente respondeu HTTP ${r.status}.`, detalhe: dados }, 502);
    return json({ ok: true, tool, resultado: dados });
  } catch (e) {
    clearTimeout(timer);
    const nome = (e as Error)?.name === "AbortError" ? "timeout" : "sem conexão";
    return json({ ok: false, error: `Falha ao falar com o agente (${nome}).` }, 504);
  }
});
