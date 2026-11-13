// diag — sonda de provedores (diagnóstico). Não devolve segredo: só status,
// latência, modelo e o texto de erro do provedor, truncado.
const KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const BASE = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (c: number, b: unknown) => new Response(JSON.stringify(b, null, 1), { status: c, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const modelo = url.searchParams.get("modelo") ?? "";
  const out: Record<string, unknown> = { base: BASE, tem_chave: KEY.length > 0, chave_len: KEY.length };

  // 1. catálogo do provedor
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(15000) });
    const txt = await r.text();
    let n = 0; try { n = (JSON.parse(txt)?.data ?? []).length; } catch { /* noop */ }
    out.models = { status: r.status, ms: Date.now() - t0, total: n, amostra: txt.slice(0, 160) };
  } catch (e) { out.models = { erro: String(e).slice(0, 200) }; }

  // 2. uma completude mínima
  const alvo = modelo || (Deno.env.get("SKYNET_MODELS") ?? "").split(",")[0] || "openai/gpt-oss-120b";
  const t1 = Date.now();
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: alvo, messages: [{ role: "user", content: "responda só: ok" }], max_tokens: 8, stream: false }),
      signal: AbortSignal.timeout(30000),
    });
    const txt = await r.text();
    out.chat = { status: r.status, ms: Date.now() - t1, modelo: alvo, corpo: txt.slice(0, 300) };
  } catch (e) { out.chat = { erro: String(e).slice(0, 200), modelo: alvo }; }
  return json(200, out);
});
