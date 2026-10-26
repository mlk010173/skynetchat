// imagem — geração de imagem pelo nosso backend (NVIDIA genai / flux).
import { createClient } from "npm:@supabase/supabase-js@2";
const K = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = SUPA_URL && SERVICE_ROLE ? createClient(SUPA_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const LIMITE_IMAGENS_HORA = 5;

async function quotaDeImagem(req: Request): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!admin) return { ok: false, status: 503, error: "rate_limit_not_configured" };
  const rawIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "desconhecido";
  const ip = rawIp.split(",")[0].trim().slice(0, 128) || "desconhecido";
  const { data, error } = await admin.rpc("consume_image_quota", { p_ip: ip, p_limit: LIMITE_IMAGENS_HORA });
  if (error) return { ok: false, status: 503, error: "rate_limit_unavailable" };
  if (data !== true) return { ok: false, status: 429, error: "limite de 5 gerações por hora atingido para este IP" };
  return { ok: true, status: 200 };
}
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (c: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: c, headers: { ...cors, "content-type": "application/json" } });

// Cada modelo aceita um corpo diferente (descoberto por teste ao vivo).
const MODELOS: Record<string, string> = {
  flux3: "black-forest-labs/flux-3-image-klein",
  flux2: "black-forest-labs/flux.2-klein-4b",
  fluxdev: "black-forest-labs/flux.1-dev",
  fluxschnell: "black-forest-labs/flux.1-schnell",
};

function corpoDoModelo(id: string, prompt: string, aspecto: string, passos: number) {
  if (id === "black-forest-labs/flux-3-image-klein") {
    return { prompt, mode: "t2i", aspect_ratio: aspecto, steps: passos };
  }
  if (id === "black-forest-labs/flux.2-klein-4b") return { prompt };
  return { prompt, mode: "base" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!K) return json(503, { ok: false, error: "chave de imagem nao configurada" });
  const quota = await quotaDeImagem(req);
  if (!quota.ok) return json(quota.status, { ok: false, error: quota.error });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "bad_request" }); }
  const prompt = String(body.prompt ?? body.p ?? "").trim().slice(0, 1200);
  if (!prompt) return json(400, { ok: false, error: "prompt obrigatorio" });
  const qual = MODELOS[String(body.modelo ?? body.model ?? "flux3")] ?? MODELOS.flux3;
  const requestedAspect = String(body.aspect_ratio ?? "1:1");
  const allowedAspects = new Set(["1:1", "16:9", "9:16", "4:3", "3:4"]);
  const aspecto = allowedAspects.has(requestedAspect) ? requestedAspect : "1:1";
  const envio = corpoDoModelo(qual, prompt, aspecto, Math.min(Math.max(Number(body.steps) || 30, 10), 50));
  const r = await fetch(`https://ai.api.nvidia.com/v1/genai/${qual}`, {
    method: "POST",
    headers: { authorization: `Bearer ${K}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(envio),
    signal: AbortSignal.timeout(90_000),
  });
  const d = await r.json().catch(() => null);
  const artefato = d?.artifacts?.[0];
  if (!r.ok || !artefato?.base64) {
    return json(502, { ok: false, error: "geracao falhou", detalhe: JSON.stringify(d).slice(0, 220) });
  }
  return json(200, {
    ok: true,
    modelo: qual,
    disponiveis: Object.keys(MODELOS),
    formato: "jpeg",
    imagem_base64: artefato.base64,
    seed: artefato.seed ?? null,
    data_url: `data:image/jpeg;base64,${artefato.base64}`,
  });
});
