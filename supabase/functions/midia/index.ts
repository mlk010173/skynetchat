// Endpoint público de mídia: devolve o embed tocável para YouTube, Spotify,
// SoundCloud, Vimeo e arquivos diretos. Sem chave de API externa.
import { resolverMidia } from "../_shared/midia.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const url = new URL(req.url);
    let pedido: Record<string, unknown> = {};
    if (req.method === "POST") pedido = await req.json().catch(() => ({}));
    const consulta = String(pedido.consulta ?? url.searchParams.get("q") ?? "").slice(0, 200);
    const provedor = String(pedido.provedor ?? url.searchParams.get("p") ?? "").toLowerCase();
    const link = String(pedido.url ?? url.searchParams.get("url") ?? "");
    if (!consulta && !link) return json({ ok: false, mensagem: "Informe q= (busca) ou url= (link de mídia)." }, 400);
    const r = await resolverMidia({ consulta, provedor, url: link });
    return json(r);
  } catch (e) {
    return json({ ok: false, mensagem: "Falha ao resolver a mídia.", erro: String(e).slice(0, 140) }, 500);
  }
});
