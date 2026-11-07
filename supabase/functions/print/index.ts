// Captura sob demanda de uma página (usada pelo navegador ao vivo do chat).
// Público, com limite simples por IP para não virar gerador de carga.
import { capturarTela } from "../_shared/print.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const janelas = new Map<string, { n: number; ate: number }>();
const LIMITE = 40; // capturas por minuto por IP

function liberado(ip: string): boolean {
  const agora = Date.now();
  const j = janelas.get(ip);
  if (!j || agora > j.ate) { janelas.set(ip, { n: 1, ate: agora + 60_000 }); return true; }
  if (j.n >= LIMITE) return false;
  j.n += 1;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  let alvo = url.searchParams.get("url") ?? "";
  let largura = Number(url.searchParams.get("w") ?? 1280);
  let altura = Number(url.searchParams.get("h") ?? 800);
  if (req.method === "POST") {
    const corpo = await req.json().catch(() => ({}));
    alvo = alvo || String(corpo?.url ?? "");
    if (corpo?.w) largura = Number(corpo.w);
    if (corpo?.h) altura = Number(corpo.h);
  }
  if (!alvo) {
    return new Response(JSON.stringify({ ok: false, erro: "informe url" }), {
      status: 400, headers: { ...cors, "content-type": "application/json" },
    });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!liberado(ip)) {
    return new Response(JSON.stringify({ ok: false, erro: "muitas capturas em pouco tempo, aguarde um minuto" }), {
      status: 429, headers: { ...cors, "content-type": "application/json" },
    });
  }
  const r = await capturarTela(alvo, Math.min(Math.max(largura, 320), 1920), Math.min(Math.max(altura, 240), 1200));
  return new Response(JSON.stringify({ ...r, em: new Date().toISOString() }), {
    status: r.ok ? 200 : 502,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
});
