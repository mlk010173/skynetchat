// imagem — geração de imagem pelo nosso backend (NVIDIA genai / flux).
const K = Deno.env.get("OPENAI_API_KEY") ?? "";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (c: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: c, headers: { ...cors, "content-type": "application/json" } });

const MODELOS: Record<string, { id: string; mode: string }> = {
  flux3: { id: "black-forest-labs/flux-3-image-klein", mode: "t2i" },
  schnell: { id: "black-forest-labs/flux.1-schnell", mode: "base" },
  dev: { id: "black-forest-labs/flux.1-dev", mode: "base" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!K) return json(500, { ok: false, error: "chave de imagem nao configurada" });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "bad_request" }); }
  const prompt = String(body.prompt ?? body.p ?? "").trim().slice(0, 1200);
  if (!prompt) return json(400, { ok: false, error: "prompt obrigatorio" });
  const qual = MODELOS[String(body.modelo ?? body.model ?? "flux3")] ?? MODELOS.flux3;
  const envio = {
    prompt,
    mode: qual.mode,
    aspect_ratio: String(body.aspect_ratio ?? "1:1"),
    steps: Math.min(Math.max(Number(body.steps) || 30, 10), 50),
  };
  const r = await fetch(`https://ai.api.nvidia.com/v1/genai/${qual.id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${K}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(envio),
  });
  const d = await r.json().catch(() => null);
  const artefato = d?.artifacts?.[0];
  if (!r.ok || !artefato?.base64) {
    return json(502, { ok: false, error: "geracao falhou", detalhe: JSON.stringify(d).slice(0, 220) });
  }
  return json(200, {
    ok: true,
    modelo: qual.id,
    formato: "jpeg",
    imagem_base64: artefato.base64,
    seed: artefato.seed ?? null,
    data_url: `data:image/jpeg;base64,${artefato.base64}`,
  });
});
