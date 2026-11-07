// Keep-alive: mantém o worker do Render e o caminho do chat quentes.
// Render free hiberna e o primeiro toque depois disso custa caro; um toque a cada
// poucos minutos segura a instância acordada e o ping do agente fica estável.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const medir = async (url: string, init?: RequestInit) => {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
    return { url, status: r.status, ms: Math.round(performance.now() - t0), ok: r.status < 500 };
  } catch (e) {
    return { url, status: 0, ms: Math.round(performance.now() - t0), ok: false, erro: String((e as Error)?.message ?? e).slice(0, 80) };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supa = Deno.env.get("SUPABASE_URL")!;
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const agente = Deno.env.get("AGENT_URL") ?? "https://skynet-agent.onrender.com";
  const site = Deno.env.get("SITE_URL") ?? "https://skynetchat-xi.vercel.app";

  const alvos = await Promise.all([
    medir(`${agente}/health`),
    medir(`${supa}/functions/v1/models`, { headers: { apikey: chave, authorization: `Bearer ${chave}` } }),
    medir(site, { method: "HEAD" }),
    medir(`${supa}/rest/v1/accounts?select=id&limit=1`, { headers: { apikey: chave, authorization: `Bearer ${chave}`, prefer: "count=exact" } }),
  ]);

  const lento = alvos.filter((a) => !a.ok || a.ms > 2500);
  return new Response(JSON.stringify({ ok: lento.length === 0, quando: new Date().toISOString(), alvos }), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
