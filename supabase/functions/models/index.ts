// Edge Function: models — lista de modelos disponíveis no seletor.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }
  const envModels = Deno.env.get("SKYNET_MODELS");
  const models = envModels
    ? envModels.split(",").map((m) => m.trim()).filter(Boolean)
    : ["gpt-4o-mini", "gpt-4o"];
  return new Response(
    JSON.stringify({ ok: true, models, ai_configured: !!Deno.env.get("OPENAI_API_KEY") }),
    { headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } },
  );
});
