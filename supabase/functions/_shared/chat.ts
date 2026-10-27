// Chama a edge function chat por dentro e devolve a resposta completa.
export type Resposta = { answer: string; model: string; conversationId: string | null };

export async function perguntar(
  content: string,
  model = "auto",
  conversation: string | null = null,
): Promise<Resposta> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/chat`;
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${chaveServico}`,
      apikey: chaveServico,
    },
    body: JSON.stringify({ content, model, conversationId: conversation }),
  });
  if (!r.ok || !r.body) {
    const texto = await r.text().catch(() => "");
    throw new Error(`chat ${r.status}: ${texto.slice(0, 160)}`);
  }
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", resposta = "", usado = model, conv: string | null = conversation;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const blocos = buf.split("\n\n");
    buf = blocos.pop() ?? "";
    for (const bloco of blocos) {
      const linha = bloco.trim();
      if (!linha.startsWith("data:")) continue;
      try {
        const d = JSON.parse(linha.slice(5).trim());
        if (d.delta) resposta += d.delta;
        if (d.done) { usado = d.model ?? usado; conv = d.conversationId ?? conv; }
      } catch (_) { /* eventos parciais */ }
    }
  }
  return { answer: resposta, model: usado, conversationId: conv };
}
