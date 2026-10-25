// Edge Function: mock-llm — emulador OpenAI-compatível para testes E2E.
// Suporta /chat/completions (com e sem stream) e /embeddings (1536 dims).
// Não usa IA real: devolve texto fixo para validar os caminhos de código
// do SKYNET (streaming, persistência, memória vetorial, busca).
Deno.serve(async (req) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  if (url.pathname.endsWith("/embeddings")) {
    return new Response(
      JSON.stringify({ data: [{ object: "embedding", index: 0, embedding: Array.from({ length: 1536 }, () => 0.01) }] }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  if (url.pathname.endsWith("/chat/completions")) {
    const body = await req.json().catch(() => ({}));
    const text = "Resposta de teste do MOCK-LLM do SKYNET: streaming, persistência e memória funcionando.";
    if (!body.stream) {
      return new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const words = text.split(" ");
    let i = 0;
    const stream = new ReadableStream({
      start(controller) {
        const timer = setInterval(() => {
          if (i >= words.length) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            clearInterval(timer);
            controller.close();
            return;
          }
          const chunk = { choices: [{ delta: { content: words[i] + " " } }] };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          i++;
        }, 60);
      },
    });
    return new Response(stream, {
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
});
