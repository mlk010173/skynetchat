// Edge Function: models — catálogo do backend (o frontend não decide nada).
// Devolve os modelos disponíveis, o tier de cada um e as opções automáticas.
import { catalog, health, providerOf } from "../_shared/router.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const lista = catalog().filter((m) => providerOf(m.provider));
  const saude = await health(svc).catch(() => new Map());

  const modelos = lista.map((m) => {
    const h = saude.get(m.id);
    const total = (h?.ok ?? 0) + (h?.fail ?? 0);
    return {
      id: m.id,
      label: m.label,
      tier: m.tier,
      provider: m.provider,
      latencia_ms: h?.avg_ms ?? null,
      taxa_sucesso: total ? Math.round(((h!.ok ?? 0) / total) * 100) : null,
      em_cooldown: !!h?.cooldown_until && new Date(h.cooldown_until).getTime() > Date.now(),
    };
  });

  return new Response(
    JSON.stringify({
      ok: true,
      ai_configured: modelos.length > 0,
      automatico: [
        { id: "auto", label: "Automático (melhor agora)" },
        { id: "melhor", label: "Máxima qualidade" },
      ],
      models: modelos,
    }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
