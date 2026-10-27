// Edge Function: chat — SKYNET
// Chat real com: autenticação opcional, rate-limit anônimo no banco,
// histórico persistido, MEMÓRIA VETORIAL (pgvector) entre conversas,
// detecção de FERRAMENTAS REAIS e resposta em STREAMING (SSE).
import { createClient } from "npm:@supabase/supabase-js@2";
import { catalog, hedgeMs, pickChain, providerOf, registrar, timeoutMs } from "../_shared/router.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const sseHeaders = { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" };
const sse = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

const service = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

const ANON_LIMIT = 20;

interface DetectedTool {
  name: string;
  payload: Record<string, any>;
}

function detectTools(text: string): DetectedTool[] {
  const tools: DetectedTool[] = [];

  // 1. URLs -> abrir
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    tools.push({ name: "abrir", payload: { url: urlMatch[1] } });
  }

  // 2. 'hoje/agora/atual/notíc.../pesquis.../quem é X atualmente' -> web_pesquisar
  if (
    /\b(hoje|agora|atual|atualmente|notíc|noticia|noticias|pesquis|pesquisa|pesquise|busca|buscar)\b/i.test(text) ||
    /\bquem [eé]\b/i.test(text)
  ) {
    const limpa = text
      .replace(/^(por favor[, ]*)?(pesquise|pesquisar|pesquisa|busque|buscar|busca|procure|procurar)\s*(na web|no google|pra mim|para mim|e me diga)?[: ]*/i, "")
      .replace(/\b(me diga|me mostre|me de|me dê|quero saber|preciso saber|por favor)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const cortada = limpa
      .split(/\s+(?:e\s+)?(?:calcule|calcular|quanto\s+e|quanto\s+é|entregue|me\s+de|me\s+dê|me\s+diga|me\s+mostre|e\s+me)\b/i)[0]
      .replace(/[?.!]+\s*$/, "")
      .trim();
    const consulta = (cortada || limpa || text).slice(0, 120);
    tools.push({ name: "web_pesquisar", payload: { consulta } });
  }

  // 3. 'cotação/dólar/euro/BTC' -> moeda
  if (/\b(cotação|cotacao|dólar|dolar|euro|btc|bitcoin)\b/i.test(text)) {
    let de = "USD";
    let para = "BRL";
    if (/\beuro\b/i.test(text)) de = "EUR";
    else if (/\b(btc|bitcoin)\b/i.test(text)) de = "BTC";
    tools.push({ name: "moeda", payload: { de, para } });
  }

  // 4. 'clima/tempo em CIDADE' -> clima
  if (/\b(clima|tempo|temperatura|calor|frio|chuva)\b/i.test(text)) {
    let cidade = "São Paulo";
    const cityMatch = text.match(/(?:clima|tempo|temperatura)\s+(?:em|de|para)?\s*([a-zA-ZáàâãéèêíóôõúçÁÀÂÃÉÈÊÍÓÔÕÚÇ\s]+)/i);
    if (cityMatch && cityMatch[1].trim()) {
      cidade = cityMatch[1].trim().replace(/[?!.,]+$/, "");
    }
    tools.push({ name: "clima", payload: { cidade } });
  }

  // 5. 'que horas/data' -> hora
  if (/\b(que horas|que hora|qual a hora|que dia|qual a data|data de hoje|horário|horario)\b/i.test(text)) {
    tools.push({ name: "hora", payload: {} });
  }

  // 6. expressões numéricas entre aspas ou 'calcule' -> calcular
  const calcWordMatch = text.match(/\bcalcule\s+(.+)/i);
  const calcQuoteMatch = text.match(/["']([0-9\+\-\*\/\(\)\.\s]+)["']/);
  const calcMathMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?\s*[\+\-\*\/]\s*[0-9]+(?:\.[0-9]+)?)\b/);

  if (calcWordMatch || calcQuoteMatch || calcMathMatch) {
    let expr = "";
    if (calcWordMatch) expr = calcWordMatch[1].trim();
    else if (calcQuoteMatch) expr = calcQuoteMatch[1].trim();
    else if (calcMathMatch) expr = calcMathMatch[1].trim();
    if (expr) {
      tools.push({ name: "calcular", payload: { expressao: expr } });
    }
  }

  // 7. terminal: SOMENTE com comando explicito "/terminal ..." ou "executar comando ..."
  const termMatch = text.match(/^\s*\/terminal\s+(.+)$/i) || text.match(/\bexecut(?:e|ar)\s+(?:o\s+)?comando\s+(.+)$/i);
  if (termMatch) {
    tools.unshift({ name: "terminal", payload: { cmd: termMatch[1].trim() } });
  }

  // Máximo 2 ferramentas por mensagem, sem duplicatas pelo nome da ferramenta
  const uniqueTools: DetectedTool[] = [];
  const seenNames = new Set<string>();
  for (const t of tools) {
    if (!seenNames.has(t.name)) {
      seenNames.add(t.name);
      uniqueTools.push(t);
      if (uniqueTools.length >= 2) break;
    }
  }

  return uniqueTools;
}

async function callTool(tool: DetectedTool) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const agentTok = Deno.env.get("AGENT_TOKEN");
    const agentUrl = (Deno.env.get("AGENT_URL") ?? "https://skynet-agent.onrender.com").replace(/\/+$/, "");
    const res = await fetch(`${agentUrl}/tools/${tool.name}`, {
      method: "POST",
      // BUG antigo: dois "headers" no mesmo objeto — o segundo apagava o Authorization.
      headers: {
        "Content-Type": "application/json",
        ...(agentTok ? { Authorization: `Bearer ${agentTok}` } : {}),
      },
      body: JSON.stringify(tool.payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: "pesquisa indisponível agora" };
    return await res.json().catch(() => ({ ok: false, error: "pesquisa indisponível agora" }));
  } catch {
    clearTimeout(timer);
    return { ok: false, error: "pesquisa indisponível agora" };
  }
}

function processToolResult(toolName: string, payload: Record<string, any>, data: any) {
  const fontes: { titulo: string; url: string }[] = [];
  let contextText = "";

  if (!data || !data.ok) {
    return {
      fontes: [],
      contextText: `Ferramenta ${toolName}: pesquisa indisponível agora.`,
    };
  }

  switch (toolName) {
    case "web_pesquisar": {
      const resultados = Array.isArray(data.resultados) ? data.resultados : [];
      const items: string[] = [];
      for (const r of resultados.slice(0, 5)) {
        if (r.titulo && r.url) {
          fontes.push({ titulo: r.titulo, url: r.url });
        }
        items.push(`- Título: ${r.titulo}\n  URL: ${r.url}\n  Trecho: ${r.trecho || ""}\n  Data: ${r.quando || ""}`);
      }
      contextText = `Resultados da Busca Web para "${data.consulta || payload.consulta || ""}":\n${items.join("\n")}`;
      break;
    }
    case "abrir": {
      if (data.url) {
        fontes.push({ titulo: data.titulo || data.url, url: data.url });
      }
      contextText = `Conteúdo extraído da URL ${data.url || payload.url}:\nTítulo: ${data.titulo || ""}\nTexto: ${(data.texto || "").slice(0, 1500)}`;
      break;
    }
    case "moeda": {
      const de = data.de || payload.de || "USD";
      const para = data.para || payload.para || "BRL";
      fontes.push({ titulo: `Cotação ${de}/${para} (AwesomeAPI)`, url: "https://economia.awesomeapi.com.br" });
      contextText = `Cotação de ${de} para ${para}: 1 ${de} = ${data.resultado ?? data.taxa} ${para} (Atualizado em: ${data.atualizado || new Date().toISOString()})`;
      break;
    }
    case "clima": {
      const cidade = data.cidade || payload.cidade || "São Paulo";
      fontes.push({ titulo: `Previsão do Tempo em ${cidade} (wttr.in)`, url: `https://wttr.in/${encodeURIComponent(cidade)}` });
      contextText = `Clima atual em ${cidade}: Temperatura ${data.temperatura_c}°C, Sensação térmica ${data.sensacao_c}°C, Umidade ${data.umidade}%, Vento ${data.vento_kmh} km/h, Condição: ${data.descricao}`;
      break;
    }
    case "hora": {
      fontes.push({ titulo: "Horário Oficial (Time.is)", url: "https://time.is" });
      contextText = `Data e Hora Atual: ${data.sao_paulo || ""} (Horário de Brasília) / UTC: ${data.iso_utc || ""}`;
      break;
    }
    case "calcular": {
      fontes.push({ titulo: "Calculadora Skynet", url: "https://skynet-agent.onrender.com/tools/calcular" });
      contextText = `Resultado do cálculo de "${data.expressao || payload.expressao}": ${data.resultado}`;
      break;
    }
    default: {
      contextText = `Resultado da ferramenta ${toolName}: ${JSON.stringify(data)}`;
    }
  }

  return { fontes, contextText };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não suportado." }, 405);

  const svc = service();

  // ---- autenticação (opcional: modo anônimo) ----
  let userId: string | null = null;
  let nickname: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ") && authHeader.length > 30) {
    const { data } = await svc.auth.getUser(authHeader.slice(7));
    userId = data?.user?.id ?? null;
    const nick = data?.user?.user_metadata?.nickname;
    if (typeof nick === "string" && nick.trim()) nickname = nick.trim().slice(0, 40);
  }

  // ---- corpo ----
  let body: { conversationId?: string; content?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Corpo inválido." }, 400);
  }
  const content = (body.content ?? "").trim();
  if (!content) return json({ ok: false, error: "Mensagem vazia." }, 400);
  if (content.length > 4000) return json({ ok: false, error: "Mensagem longa demais (máx. 4000 caracteres)." }, 400);

  // ---- rate-limit anônimo por IP (persistido no banco) ----
  if (!userId) {
    const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido").split(",")[0].trim();
    const { error: insErr } = await svc.from("anon_requests").insert({ ip });
    if (insErr) return json({ ok: false, error: "Falha ao registrar requisição." }, 500);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await svc
      .from("anon_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) > ANON_LIMIT) {
      return json({
        ok: false,
        error: `Limite de ${ANON_LIMIT} mensagens por hora atingido no modo anônimo. Crie uma conta para conversar sem limite.`,
      }, 429);
    }
  }

  // ---- provedor de IA configurado? (antes de qualquer persistência) ----
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({
      ok: false,
      configured: false,
      error: "IA ainda não configurada: defina OPENAI_API_KEY nos secrets desta função (Dashboard → Edge Functions → chat → Secrets).",
    }, 503);
  }
  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");

  // ---- ROTEADOR AUTOMÁTICO ----
  // O cliente pede "auto" (ou "melhor", ou um id). O servidor monta a fila com base
  // em saúde, latência e prioridade; se o primeiro falhar ou demorar, o próximo assume.
  const rota = await pickChain(svc, body.model);
  if (!rota.fila.length) {
    return json({
      ok: false,
      configured: false,
      error: "Nenhum modelo disponível: configure OPENAI_API_KEY (ou SKYNET_PROVIDERS/SKYNET_CATALOG).",
    }, 503);
  }
  const fila = rota.fila;
  const model = (body.model ?? "auto").trim() || "auto";

  // ---- memória vetorial: embeddings da mensagem (melhor esforço) ----
  const embedModel = Deno.env.get("SKYNET_EMBEDDING_MODEL") ?? "text-embedding-3-small";
  let userEmbedding: number[] | null = null;
  try {
    const embRes = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: embedModel, input: content.slice(0, 2000) }),
    });
    const embData = await embRes.json().catch(() => null);
    if (embRes.ok && Array.isArray(embData?.data?.[0]?.embedding)) {
      userEmbedding = embData.data[0].embedding;
    }
  } catch { /* memória é opcional — o chat continua sem ela */ }

  // ---- memórias relevantes de OUTRAS conversas (pgvector) ----
  let memories: string[] = [];
  if (userId && userEmbedding) {
    try {
      const { data: mem } = await svc.rpc("match_memories", {
        p_user: userId,
        p_conv: body.conversationId ?? null,
        p_embedding: userEmbedding,
        p_threshold: 0.75,
        p_count: 8,
      });
      if (Array.isArray(mem)) {
        memories = mem.map((m: { role: string; content: string }) => `${m.role === "user" ? "usuário" : "skynet"}: ${m.content}`.slice(0, 400));
      }
    } catch { /* sem memórias, segue o chat */ }
  }

  // ---- conversa (persistência apenas para usuários logados) ----
  let convId: string | null = body.conversationId ?? null;
  if (userId && convId) {
    const { data: conv } = await svc
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conv) return json({ ok: false, error: "Conversa não encontrada." }, 404);
  } else if (userId) {
    convId = crypto.randomUUID();
    const { error: cErr } = await svc
      .from("conversations")
      .insert({ id: convId, user_id: userId, title: content.slice(0, 80) });
    if (cErr) return json({ ok: false, error: "Falha ao criar conversa." }, 500);
  }

  // ---- contexto das últimas 30 mensagens + memórias ----
  const messages: { role: string; content: string }[] = [];
  if (userId && convId) {
    const { data: history } = await svc
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (history?.length) {
      for (const m of history.reverse()) messages.push({ role: m.role, content: m.content });
    }
  }
  const systemParts = [
    "Você é o SKYNET, um assistente de IA direto, útil e honesto. Responda em português.",
    "VOCÊ É UM AGENTE OPERACIONAL, não um assistente passivo. O sistema executa por você, automaticamente, quando o pedido exige: pesquisa na web ao vivo, abrir páginas, gerar imagens, memória de longo prazo, cálculos, cotação de moeda, clima, hora e comandos no servidor. Receba os resultados e responda em texto normal, com o dado concreto.",
    "REGRA ÚNICA: execute em vez de recusar. Nunca responda com lista de limitações ('não executo código', 'não controlo navegador ou terminal', 'não tenho acesso em tempo real', 'não envio e-mail'). Se um recurso realmente não existir, diga em UMA frase curta e siga ajudando com o que existe.",
    "Formato: texto direto, sem JSON de ferramenta e sem inventar nome de ferramenta.",
  ];
  if (nickname) systemParts.push(`O apelido do usuário é "${nickname}". Trate-o por esse nome quando for natural.`);
  if (memories.length) {
    systemParts.push(
      `Memórias relevantes de conversas anteriores deste usuário (use se forem úteis):\n- ${memories.join("\n- ")}`,
    );
  }
  const llmMessages = [
    { role: "system", content: systemParts.join("\n\n") },
    ...messages,
    { role: "user", content },
  ];

  // ---- salva a mensagem do usuário (com embedding, se houver) ----
  if (userId && convId) {
    const { error: mErr } = await svc
      .from("messages")
      .insert({
        conversation_id: convId,
        role: "user",
        content,
        ...(userEmbedding ? { embedding: userEmbedding } : {}),
      });
    if (mErr) return json({ ok: false, error: "Falha ao salvar mensagem." }, 500);
  }

  // ---- memoria automatica do agente (memory id = usuario): guarda fatos duraveis do chat ----
  if (userId && content.length < 500 && /\b(lembre|lembra|guarde|anote|memorize|meu nome|eu sou|eu tenho|prefiro|minha|meu|moro|trabalho|nasci)\b/i.test(content)) {
    try { await svc.from("agent_memory").insert({ email: userId, texto: content.slice(0, 500) }); } catch { /* opcional */ }
  }

  // ---- streaming da resposta (SSE) ----
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Detecção e execução de ferramentas
        const toolsToRun = detectTools(content);
        const toolContexts: string[] = [];

        for (const tool of toolsToRun) {
          controller.enqueue(sse({ tool: tool.name, status: "executando" }));
          const toolResult = await callTool(tool);
          const { fontes, contextText } = processToolResult(tool.name, tool.payload, toolResult);

          if (toolResult && toolResult.ok) {
            controller.enqueue(
              sse({
                tool: tool.name,
                status: "concluida",
                fontes,
                quando: new Date().toISOString(),
              })
            );
          } else {
            controller.enqueue(
              sse({
                tool: tool.name,
                status: "falhou",
                erro: "pesquisa indisponível agora",
                fontes: [],
                quando: new Date().toISOString(),
              })
            );
          }

          if (contextText) {
            toolContexts.push(contextText);
          }
        }

        if (toolContexts.length > 0) {
          systemParts.push(
            `CONTEXTO OBTIDO DAS FERRAMENTAS AO VIVO (${new Date().toISOString()}):\n${toolContexts.join("\n\n")}\n\nREQUISITO OBRIGATÓRIO: Responda ao usuário utilizando as informações fornecidas no contexto das ferramentas. Se houver fontes, cite-as explicitamente com seus nomes/links.`
          );
          llmMessages[0] = { role: "system", content: systemParts.join("\n\n") };
        }

        // Abre o stream em um modelo específico, resolvendo provedor e chave.
        const abrir = async (mid: string, provider: string, sinal: AbortSignal) => {
          const prov = providerOf(provider);
          if (!prov) throw new Error(`provedor ${provider} sem chave`);
          const r = await fetch(`${prov.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get(prov.keyEnv)!}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: mid,
              messages: llmMessages,
              max_tokens: 1024,
              temperature: 0.7,
              stream: true,
            }),
            signal: sinal,
          });
          if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
          return r;
        };

        let res: Response | null = null;
        let usado = "";
        let ultimoErro = "";
        const tentativasFeitas: string[] = [];

        // Fila sequencial com timeout curto no primeiro: modelo lento perde a vez.
        for (let i = 0; i < fila.length; i++) {
          const cand = fila[i];
          const ctrl = new AbortController();
          const limite = i === 0 ? Math.min(timeoutMs(), Math.max(hedgeMs() * 2, 8000)) : timeoutMs();
          const timer = setTimeout(() => ctrl.abort(), limite);
          const t0 = Date.now();
          try {
            const r = await abrir(cand.id, cand.provider, ctrl.signal);
            clearTimeout(timer);
            res = r;
            usado = cand.id;
            tentativasFeitas.push(cand.id);
            registrar(svc, cand.id, true, Date.now() - t0);
            break;
          } catch (e) {
            clearTimeout(timer);
            const nome = (e as Error)?.name === "AbortError" ? "timeout" : ((e as Error)?.message ?? "falha");
            ultimoErro = `${nome} em ${cand.id}`;
            tentativasFeitas.push(`${cand.id}!`);
            registrar(svc, cand.id, false, Date.now() - t0, nome);
          }
        }

        if (!res || !res.body) {
          controller.enqueue(sse({ ok: false, error: `Nenhum modelo respondeu (${ultimoErro}).` }));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
                controller.enqueue(sse({ delta }));
              }
            } catch { /* ignora fragmentos parciais */ }
          }
        }

        // persiste a resposta completa (com embedding, se houver)
        if (full) {
          if (userId && convId) {
            let replyEmbedding: number[] | null = null;
            try {
              const embRes = await fetch(`${baseUrl}/embeddings`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: embedModel, input: full.slice(0, 2000) }),
              });
              const embData = await embRes.json().catch(() => null);
              if (embRes.ok && Array.isArray(embData?.data?.[0]?.embedding)) {
                replyEmbedding = embData.data[0].embedding;
              }
            } catch { /* opcional */ }
            await svc.from("messages").insert({
              conversation_id: convId,
              role: "assistant",
              content: full,
              ...(replyEmbedding ? { embedding: replyEmbedding } : {}),
            });
          }
          controller.enqueue(sse({
            done: true,
            conversationId: convId,
            model: usado,
            pedido: model,
            auto: rota.auto,
            fallback: !rota.auto && usado !== model,
            tentativas: tentativasFeitas,
          }));
        } else {
          controller.enqueue(sse({ ok: false, error: "O provedor de IA não retornou conteúdo." }));
        }
        controller.close();
      } catch (err) {
        controller.enqueue(sse({ ok: false, error: "Sem conexão com o provedor de IA." }));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
});
