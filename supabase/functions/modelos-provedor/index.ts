// Diagnóstico de catálogo: lista os modelos que o provedor realmente expõe.
// Protegido por chave de operação (secret SKYNET_OPS_KEY). Nunca devolve credenciais.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const base0 = (Deno.env.get("OPENAI_BASE_URL") ?? "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const key0 = Deno.env.get("OPENAI_API_KEY") ?? "";
  const chave = url.searchParams.get("k") ?? req.headers.get("x-ops-key") ?? "";
  const esperada = Deno.env.get("SKYNET_OPS_KEY") ?? "";
  if (!esperada || chave !== esperada) {
    return new Response(JSON.stringify({ ok: false, error: "não autorizado" }), {
      status: 401, headers: { ...cors, "content-type": "application/json" },
    });
  }

  // ?test=modelo1,modelo2  -> faz um chat mínimo e devolve status real de cada um
  const testar = url.searchParams.get("test");
  if (testar) {
    const base = base0; const key = key0;
    const lista = testar.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);
    const resultados = await Promise.all(lista.map(async (m) => {
      const t0 = Date.now();
      try {
        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ model: m, messages: [{ role: "user", content: "diga ok" }], max_tokens: 12 }),
          signal: AbortSignal.timeout(30000),
        });
        const bruto = await r.text();
        let erro = "";
        let amostra = "";
        try {
          const d = JSON.parse(bruto);
          if (r.ok) amostra = String(d?.choices?.[0]?.message?.content ?? "").slice(0, 40);
          else erro = String(d?.error?.message ?? d?.detail ?? d?.message ?? bruto).slice(0, 120);
        } catch { erro = bruto.slice(0, 120); }
        return { modelo: m, status: r.status, ok: r.ok, ms: Date.now() - t0, amostra, erro };
      } catch (e) {
        return { modelo: m, status: 0, ok: false, ms: Date.now() - t0, erro: String(e).slice(0, 120) };
      }
    }));
    return new Response(JSON.stringify({ ok: true, resultados }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  const base = (Deno.env.get("OPENAI_BASE_URL") ?? "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const key = Deno.env.get("OPENAI_API_KEY") ?? "";
  try {
    const base = base0; const key = key0;
    const r = await fetch(`${base}/models`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(25000),
    });
    const d = await r.json().catch(() => null);
    const bruto = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
    const ids = bruto.map((m: any) => String(m?.id ?? m?.name ?? "")).filter(Boolean).sort();
    return new Response(JSON.stringify({ ok: r.ok, status: r.status, host: base.replace(/^https?:\/\//, ""), total: ids.length, ids }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 160), host: base.replace(/^https?:\/\//, "") }), {
      status: 502, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
