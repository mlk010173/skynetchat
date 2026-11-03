// Painel de saúde do backend (público, sem dados sensíveis).
import { json } from "../_shared/apikey.ts";
import { svc } from "../_shared/sessao.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const inicio = performance.now();
  const db = svc();

  const { data: saude } = await db
    .from("model_health")
    .select("model, ok, latency_ms, checked_at")
    .order("checked_at", { ascending: false })
    .limit(400);

  const ultimos = new Map<string, any>();
  for (const l of saude ?? []) if (!ultimos.has(l.model)) ultimos.set(l.model, l);
  const modelos = [...ultimos.values()].sort((a, b) => (a.latency_ms ?? 9e9) - (b.latency_ms ?? 9e9));

  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: chamadas } = await db
    .from("api_log").select("rota, status").gte("created_at", desde).limit(2000);
  const total = chamadas?.length ?? 0;
  const erros = (chamadas ?? []).filter((c: any) => c.status >= 400).length;

  const { count: contas } = await db.from("accounts").select("id", { count: "exact", head: true });
  const { count: conversas } = await db.from("conversations").select("id", { count: "exact", head: true });
  const { count: mensagens } = await db.from("messages").select("id", { count: "exact", head: true });

  const banco = await db.from("accounts").select("id", { count: "exact", head: true });

  // Mapa de integracoes: cada motor do produto testado na hora.
  const agenteUrl = (Deno.env.get("AGENT_URL") ?? "https://skynet-agent.onrender.com").replace(/\/+$/, "");
  const medir = async (nome: string, url: string, init?: RequestInit) => {
    const t0 = performance.now();
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(9000) });
      const vivo = r.ok || r.status === 400 || r.status === 422;
      return { motor: nome, ok: vivo, status: r.status, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { motor: nome, ok: false, erro: String(e).slice(0, 70), ms: Math.round(performance.now() - t0) };
    }
  };
  const chaveModelos = Deno.env.get("OPENAI_API_KEY") ?? "";
  const integracoes = await Promise.all([
    medir("render-agente", `${agenteUrl}/health`),
    medir("provedor-modelos", `${Deno.env.get("OPENAI_BASE_URL") ?? "https://integrate.api.nvidia.com/v1"}/models`, {
      headers: { Authorization: `Bearer ${chaveModelos}` },
    }),
    medir("gerador-imagem-nvidia", "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b", {
      method: "POST",
      headers: { Authorization: `Bearer ${chaveModelos}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    }),
    medir("fallback-imagem", "https://image.pollinations.ai/", { method: "HEAD" }),
  ]);

  return json({
    ok: true,
    verificado_em: new Date().toISOString(),
    resposta_ms: Math.round(performance.now() - inicio),
    banco: banco.error ? "falha" : "ok",
    funcoes: ["chat", "models", "conversations", "auth", "auth-code", "imagem", "api", "mcp", "status", "agent", "agent-exec", "email", "memorias", "integracoes", "automations-run", "automations-tick"],
    modelos: {
      medidos: modelos.length,
      saudaveis: modelos.filter((m) => m.ok).length,
      detalhe: modelos.slice(0, 12).map((m) => ({
        modelo: m.model, ok: m.ok, latencia_ms: m.latency_ms, visto_em: m.checked_at,
      })),
    },
    integracoes,
    chaves: {
      huggingface: Boolean(Deno.env.get("HF_TOKEN")),
      resend: Boolean(Deno.env.get("RESEND_API_KEY")),
      gmail: Boolean(Deno.env.get("GMAIL_ACCESS_TOKEN")),
      agente: Boolean(Deno.env.get("AGENT_TOKEN")),
    },
    uso_24h: { chamadas_api: total, erros, taxa_erro: total ? Number((erros / total).toFixed(3)) : 0 },
    numeros: { contas: contas ?? 0, conversas: conversas ?? 0, mensagens: mensagens ?? 0 },
  });
});
