// Chama a edge function chat por dentro e devolve a resposta completa.
// Aceita os dois protocolos: o legado ("data: {...}") e o do AI SDK
// (quadros "0:", "2:", "3:", "d:") — o chat emite o do AI SDK hoje.
export type Resposta = { answer: string; model: string; conversationId: string | null };

type Acumulado = { resposta: string; modelo: string; conversa: string | null; erro: string | null };

function aplicarQuadro(linha: string, acc: Acumulado) {
  if (!linha) return;
  // ---- protocolo legado ----
  if (linha.startsWith("data:")) {
    try {
      const ev = JSON.parse(linha.slice(5).trim());
      if (ev.delta) acc.resposta += String(ev.delta);
      if (ev.model) acc.modelo = String(ev.model);
      if (ev.conversationId) acc.conversa = String(ev.conversationId);
      if (ev.error) acc.erro = String(ev.error);
    } catch { /* quadro parcial */ }
    return;
  }
  // ---- protocolo do AI SDK ----
  const sep = linha.indexOf(":");
  if (sep <= 0) return;
  const tipo = linha.slice(0, sep);
  const corpo = linha.slice(sep + 1);
  try {
    if (tipo === "0") {
      const txt = JSON.parse(corpo);
      if (typeof txt === "string") acc.resposta += txt;
    } else if (tipo === "2") {
      const itens = JSON.parse(corpo);
      for (const it of Array.isArray(itens) ? itens : [itens]) {
        if (it && it.tipo === "modelo" && it.modelo) acc.modelo = String(it.modelo);
      }
    } else if (tipo === "3") {
      const msg = JSON.parse(corpo);
      acc.erro = typeof msg === "string" ? msg : JSON.stringify(msg);
    } else if (tipo === "d") {
      const fim = JSON.parse(corpo);
      const meta = fim?.messageMetadata ?? {};
      if (meta.conversationId) acc.conversa = String(meta.conversationId);
      if (meta.model) acc.modelo = String(meta.model);
    }
  } catch { /* quadro parcial */ }
}

export async function perguntar(
  content: string,
  model = "auto",
  conversation: string | null = null,
  conta: string | null = null,
): Promise<Resposta> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/chat`;
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${chaveServico}`,
      apikey: chaveServico,
      ...(conta ? { "x-conta-id": conta } : {}),
    },
    body: JSON.stringify({ content, model, conversationId: conversation }),
  });
  if (!r.ok || !r.body) {
    const texto = await r.text().catch(() => "");
    throw new Error(`chat ${r.status}: ${texto.slice(0, 160)}`);
  }
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const acc: Acumulado = { resposta: "", modelo: model, conversa: conversation, erro: null };
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // o AI SDK termina os quadros em "\n" simples; o legado usa "\n\n"
    const linhas = buf.split("\n");
    buf = linhas.pop() ?? "";
    for (const bruta of linhas) aplicarQuadro(bruta.trim(), acc);
  }
  if (buf.trim()) aplicarQuadro(buf.trim(), acc);
  if (!acc.resposta && acc.erro) throw new Error(acc.erro.slice(0, 200));
  return { answer: acc.resposta, model: acc.modelo, conversationId: acc.conversa };
}
