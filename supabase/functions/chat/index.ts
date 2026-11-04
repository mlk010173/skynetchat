// Edge Function: chat — SKYNET
// Chat real com: autenticação opcional, rate-limit anônimo no banco,
// histórico persistido, MEMÓRIA VETORIAL (pgvector) entre conversas,
// detecção de FERRAMENTAS REAIS e resposta em STREAMING (SSE).
import { createClient } from "npm:@supabase/supabase-js@2";
import { catalog, hedgeMs, pickChain, providerOf, registrar, timeoutMs } from "../_shared/router.ts";
import { contaDaSessao, consumirMensagem, memoriasDaConta } from "../_shared/sessao.ts";
import { infraTudo } from "../_shared/infra.ts";
import { liberar, ipDe, respostaLimite } from "../_shared/limite.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const sseHeaders = { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" };
const sse = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

// ---- protocolo de streaming do Vercel AI SDK (UI message stream) ----
const enc = new TextEncoder();
const tTexto = (t: string) => enc.encode(`0:${JSON.stringify(t)}\n`);
const tDados = (o: unknown) => enc.encode(`2:${JSON.stringify([o])}\n`);
const tErro = (m: string) => enc.encode(`3:${JSON.stringify(m)}\n`);
const tFim = (meta: unknown) => enc.encode(`d:${JSON.stringify({ finishReason: "stop", messageMetadata: meta })}\n`);

import { resolverMidia } from "../_shared/midia.ts";
import { capturarTela } from "../_shared/print.ts";
import { buscarClima } from "../_shared/clima.ts";

const ROTULOS: Record<string, string> = {
  web_pesquisar: "Pesquisar na web",
  abrir: "Abrir página",
  calcular: "Calcular",
  moeda: "Consultar câmbio",
  clima: "Consultar clima",
  hora: "Ver hora",
  imagem: "Gerar imagem",
  navegar: "Navegar no site",
  sistema: "Checar o sistema",
  midia: "Tocar mídia",
  widget: "Criar widget",
  arquivo: "Gerar arquivo",
  github: "Consultar GitHub",
  print: "Capturar a tela do site",
  politicos: "Abrir painel de políticos",
  memoria: "Memória",
  infra: "Consultar infraestrutura",
  habilidade: "Usar habilidade",
};
const rotuloFerramenta = (n: string) => ROTULOS[n] ?? n;

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

function resumoDoPedido(tool: DetectedTool): string {
  const p = tool.payload as Record<string, unknown> | undefined;
  const alvo = String(p?.query ?? p?.url ?? p?.prompt ?? p?.expressao ?? p?.cidade ?? "");
  return alvo ? `${tool.name === "abrir" ? "abrindo" : "consultando"}: ${alvo.slice(0, 90)}` : "";
}

function resumirResultado(nome: string, r: unknown): string {
  const d = (r ?? {}) as Record<string, any>;
  if (!d.ok) return String(d.erro ?? d.error ?? "sem resultado").slice(0, 160);
  if (nome === "web_pesquisar") return `${(d.resultados ?? []).length} resultado(s)`;
  if (nome === "abrir" || nome === "navegar") return `${String(d.texto ?? "").replace(/\s+/g, " ").slice(0, 150)}`;
  if (nome === "calcular") return `${d.expressao ?? ""} = ${d.resultado ?? ""}`.slice(0, 80);
  if (nome === "moeda") return `1 ${d.de ?? ""} = ${d.resultado ?? d.taxa ?? ""} ${d.para ?? ""}`.slice(0, 80);
  if (nome === "clima") return `${d.cidade ?? ""}: ${d.temperatura_c ?? "?"}°C, ${d.descricao ?? ""}`.slice(0, 100);
  if (nome === "sistema") {
    const partes = [d.site ? `site ${d.site.ok ? "no ar" : "fora do ar"} (${d.site.status ?? d.site.erro}, ${d.site.ms}ms)` : "", d.agente ? `agente ${d.agente.ok ? "ok" : "falhou"} (${d.agente.status ?? d.agente.erro})` : "", `banco ${d.banco ?? "?"}`].filter(Boolean);
    return partes.join(" · ").slice(0, 180);
  }
  if (nome === "print") return d.ok ? `captura de ${String(d.alvo ?? "").slice(0, 80)} (${d.provedor})` : String(d.erro ?? "falha na captura");
  if (nome === "clima") return d.ok ? `${d.cidade}: ${d.agora?.temp ?? "?"}°C, ${d.agora?.descricao ?? ""}`.slice(0, 100) : String(d.erro ?? "sem clima");
  if (nome === "widget") return `widget de ${d.tipo} pronto`;
  if (nome === "arquivo") return `${d.nome} (${d.bytes} bytes)`;
  if (nome === "github") return d.ok ? `${d.repo}: ${d.commits?.length ?? 0} commits, ${d.estrelas} estrelas` : String(d.erro ?? "sem dados");
  if (nome === "infra") {
    return [d.supabase?.resumo, d.vercel?.resumo, d.render?.resumo].filter(Boolean).join(" · ").slice(0, 200);
  }
  if (nome === "memoria") {
    if (d.acao === "salvar") return `memória salva: ${String(d.chave ?? "").slice(0, 40)}`;
    return `${(d.memorias ?? []).length} memória(s)`;
  }
  if (nome === "midia") return d.ok ? `tocando ${d.provedor}: ${String(d.titulo ?? "").slice(0, 60)}` : String(d.mensagem ?? "mídia não encontrada").slice(0, 120);
  if (nome === "hora") return String(d.sao_paulo ?? d.iso_utc ?? "").slice(0, 60);
  if (nome === "imagem") return `imagem ${String(d.provedor ?? d.modelo ?? "")}`.slice(0, 80);
  if (nome === "habilidade") return d.ok ? `${d.nome ?? d.skill}: ${String(d.detalhe ?? d.resultado ?? "")}`.slice(0, 160) : String(d.erro ?? "habilidade não encontrada").slice(0, 120);
  return JSON.stringify(d).slice(0, 150);
}

function detectTools(text: string): DetectedTool[] {
  const tools: DetectedTool[] = [];

  const GATILHO_HABILIDADE = new RegExp([
    "\\d+\\s*%", "por ?cento", "porcentagem",
    "\\bbase64\\b", "\\bsha-?256\\b", "\\buuid\\b", "\\bsenha\\b", "pal[ií]ndromo", "vogais|consoantes",
    "\\bromanos?\\b", "\\bbin[aá]rio\\b", "octal", "hexadecimal", "\\bjson\\b", "\\bcsv\\b", "\\bslug\\b", "acento",
    "mai[uú]scul|min[uú]scul", "\\bcep\\b", "qr ?code", "wikipedia|cota[cç][aã]o", "d[oó]lar|euro|libra",
    "\\bcpf\\b", "\\bcnpj\\b", "e-?mails?", "\\bimc\\b", "gorjeta|rachar", "desconto|acr[eé]scimo",
    "combust[ií]vel|gasolina|km\\/l", "fatorial", "\\bprimo\\b", "\\bmdc\\b|\\bmmc\\b", "fibonacci",
    "juros", "regra de (tr[eê]s|3)", "hipotenusa|pit[aá]goras", "m[eé]dia|mediana|desvio|estat[ií]stica",
    "sorte(ie|ar)|cara ou coroa|\\bdado\\b", "por extenso", "\\bidade\\b", "dia da semana",
    "daqui a \\d+ dia|dias? atr[aá]s", "diferen[cç]a entre datas|quantos dias",
    "quantas palavras|contar palavras|quantos caracteres", "\\bregex\\b", "url ?encode|url ?decode",
    "extrai[ar] (e-?mails?|links?|n[uú]meros)", "#[0-9a-f]{6}\\b", "rgb\\(",
    "converter|milhas?|libras?|polegadas?|gal[oõ]es", "celsius|fahrenheit|kelvin",
    "segundos|\\bbytes\\b|\\bgb\\b", "inverter (o )?texto", "repetir|truncar",
    "camel ?case|snake ?case|kebab|pascal ?case",
  ].join("|"), "i");


  // 1. URLs -> abrir
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    tools.push({ name: "abrir", payload: { url: urlMatch[1] } });
  }

  // 1a. "entra no site", "abre a página X", "navega em example.com" -> navegar
  const pedeNavegar =
    /\b(naveg\w*|entr\w+ (?:no|na|em)|abr\w+ (?:o|a|esse|esta) ?(?:site|p[aá]gina|link|url)|ver (?:o|esse|este) site|renderiz\w+)\b/i.test(text) ||
    /\bchromium\b/i.test(text);
  const siteNoTexto = text.match(/\b((?:[a-z0-9-]+\.)+(?:com|com\.br|net|org|io|dev|app|br)(?:\/[^\s,]*)?)\b/i);
  if (pedeNavegar) {
    const alvoUrl = urlMatch ? urlMatch[1] : siteNoTexto ? `https://${siteNoTexto[1]}` : "";
    tools.push({ name: "navegar", payload: alvoUrl ? { url: alvoUrl } : { consulta: text.slice(0, 120) } });
  }

  // 1c. "seu site está no ar?", "status do sistema", "seus servidores" -> autodiagnóstico
  if (/\b(seu|teu|pr[oó]prio)\s+(site|servidor(?:es)?|sistema|backend|banco)\b/i.test(text) ||
      /\b(status|sa[uú]de|diagn[oó]stico|autodiagn[oó]stico)\b[\s\S]{0,24}\b(sistema|site|servidor|skynet|voc[eê])\b/i.test(text) ||
      /\b(est[aá] (no ar|online|fora do ar)|tudo funcionando|como voc[eê] est[aá])\b/i.test(text)) {
    tools.push({ name: "sistema", payload: { pedido: text.slice(0, 120) } });
  }

  // 1d. infraestrutura: supabase, vercel e render
  if (/\b(supabase|vercel|render)\b/i.test(text) &&
      /\b(status|sa[uú]de|deploy|deploys|fun[cç][oõ]es|functions|banco|database|tabela|env|vari[aá]veis|logs?|projeto|servi[cç]o|servi[cç]os|no ar|quantas|quantos|est[aá]|como est[aá])\b/i.test(text)) {
    tools.push({ name: "infra", payload: { pedido: text.slice(0, 160) } });
  }
  if (/\b(infraestrutura|stack|as tr[eê]s plataformas|todas as ferramentas)\b/i.test(text)) {
    tools.push({ name: "infra", payload: { pedido: text.slice(0, 160), tudo: true } });
  }

  // 1e. memória de longo prazo: guardar ou consultar
  const pedeGuardar = /\b(lembre|lembra|lembrar|guarde|guarda|anote|anota|memorize|registre)\b/i.test(text);
  const pedeConsultar = /\b(o que voc[eê] sabe|minhas mem[oó]rias|minha mem[oó]ria|o que lembra|mem[oó]ria de longo prazo|voc[eê] lembra)\b/i.test(text);
  if (pedeGuardar || pedeConsultar) {
    tools.push({
      name: "memoria",
      payload: pedeGuardar
        ? { acao: "salvar", texto: text.replace(/^\s*(skynet|voc[eê])?[,:]?\s*/i, "").slice(0, 600) }
        : { acao: "buscar", consulta: text.slice(0, 200) },
    });
  }

  // 1b. pedido de imagem -> imagem (gera de verdade, nao devolve JSON do modelo)
  const pedeImagem =
    /\b(gere|gerar|gera|crie|criar|cria|desenhe|desenhar|desenha|ilustre|ilustrar|fa[cç]a)\b[\s\S]{0,24}?\b(imagem|imagens|foto|figura|desenho|ilustra[cç][aã]o|logo|arte)\b/i.test(text) ||
    /\b(imagem|foto|desenho|figura)\s+(de|do|da|sobre|com)\b/i.test(text);
  if (pedeImagem) {
    const prompt = text
      .replace(/^[\s\S]{0,30}?\b(gere|gerar|gera|crie|criar|cria|desenhe|desenhar|desenha|ilustre|ilustrar|fa[cç]a)\b\s*/i, "")
      .replace(/^(uma|um|a|o)\s+/i, "")
      .replace(/^(imagem|imagens|foto|figura|desenho|ilustra[cç][aã]o)\s*(de|do|da|com|sobre)?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    tools.unshift({ name: "imagem", payload: { prompt: (prompt || text).slice(0, 400) } });
  }

  // 1e. "manda um print da tela", "captura o site X", "tira um print" -> print
  const pedePrint =
    /\b(print|screenshot|captura\w*|foto da tela|tela do site|capturar a tela)\b/i.test(text) &&
    !/\b(c[oó]digo|programa|imprimir documento)\b/i.test(text);
  if (pedePrint) {
    const link = text.match(/https?:\/\/\S+/)?.[0] ?? text.match(/\b((?:[a-z0-9-]+\.)+(?:com|com\.br|net|org|io|dev|app|br)(?:\/[^\s,]*)?)\b/i)?.[0] ?? "";
    tools.unshift({ name: "print", payload: { url: link.replace(/[.,;]$/, "") } });
  }

  // 1d. "toca X", "abre o youtube e toca Y", "coloca uma playlist", link de música -> midia
  const pedeMidia =
    /\b(toca|toque|tocar|coloca|colocar|escuta|escutar|ouvir|assistir|assiste|bota|botar|reproduz\w*|play)\b[\s\S]{0,48}?\b(m[uú]sica|som|playlist|[aá]lbum|v[ií]deo|clipe|filme|trilha|podcast|lofi|youtube|spotify|soundcloud|deezer)\b/i.test(text) ||
    /\b(youtube\.com|youtu\.be|open\.spotify\.com|soundcloud\.com|vimeo\.com)\b/i.test(text);
  if (pedeMidia) {
    const provedor = /spotify/i.test(text) ? "spotify" : /soundcloud/i.test(text) ? "soundcloud" : /vimeo/i.test(text) ? "vimeo" : "youtube";
    const link = text.match(/https?:\/\/\S+/) ?? text.match(/\b((?:www\.)?(?:youtube\.com|youtu\.be|open\.spotify\.com|soundcloud\.com|vimeo\.com)\/\S+)/i);
    const semComando = text
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\b(toca|toque|tocar|coloca|colocar|escuta|escutar|ouvir|assistir|assiste|bota|botar|reproduz\w*|play|por favor|pra mim|para mim|agora)\b/gi, " ")
      .replace(/\b(no|na|do|da|de|o|a|os|as|um|uma|em|pelo|pela)\s+(youtube|spotify|soundcloud|vimeo)\b/gi, " ")
      .replace(/\b(m[uú]sica|v[ií]deo|clipe|playlist|filme|trilha sonora|podcast)s?\b/gi, " ")
      .replace(/\b(youtube|spotify|soundcloud|vimeo|deezer)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    tools.push({ name: "midia", payload: { provedor, url: link ? link[1] ?? link[0] : "", consulta: link ? "" : semComando.slice(0, 120) } });
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

  // 3f. widget: "cria um widget/painel de X"
  if (/\b(cria|criar|monta|montar|adiciona|coloca|gera)\b[\s\S]{0,24}\b(widget|painel|card)\b/i.test(text)) {
    tools.push({ name: "widget", payload: { pedido: text.slice(0, 200) } });
  }

  // 3g. arquivo: "escreve um arquivo .txt/.md/.csv com ..."
  if (/\b(escreve|escrever|cria|criar|gera|gerar|salva|salvar|manda|exporta|exportar)\b[\s\S]{0,30}\b(arquivo|file|\.txt|\.md|\.csv|\.json|\.html)\b/i.test(text)) {
    tools.push({ name: "arquivo", payload: { pedido: text.slice(0, 400) } });
  }

  // 3h. github: repositório, commits, issues
  const repo = text.match(/\b([a-z0-9][a-z0-9-]{1,38})\/([a-z0-9._-]{1,80})\b/i);
  if (/\b(github|reposit[oó]rio|repo|commits?|issues?|pull request|branch)\b/i.test(text)) {
    tools.push({ name: "github", payload: { repo: repo ? `${repo[1]}/${repo[2]}` : "", pedido: text.slice(0, 200) } });
  }

  // 4. 'clima/tempo em CIDADE' -> clima
  if (/\b(clima|tempo|temperatura|calor|frio|chuva)\b/i.test(text)) {
    let cidade = "São Paulo";
    const cityMatch = text.match(/(?:clima|tempo|temperatura)\s+(?:em|de|para)?\s*([a-zA-ZáàâãéèêíóôõúçÁÀÂÃÉÈÊÍÓÔÕÚÇ\s]+)/i);
    if (cityMatch && cityMatch[1].trim()) {
      cidade = cityMatch[1].trim().replace(/[?!.,]+$/, "");
    }
    const limparCidade = (s: string) => {
      let c = String(s || "").replace(/\.\s*$/, "").trim();
      const lixo = /^(hoje|agora|amanh[aã]|esta|est[aá]|faz|o|a|os|as|em|de|do|da|para|no|na|tempo|clima)\s+/i;
      for (let i = 0; i < 6 && lixo.test(c); i++) c = c.replace(lixo, "").trim();
      return c.replace(/\s+(?:hoje|agora)\s*$/i, "").trim();
    };
    tools.push({ name: "clima", payload: { cidade: limparCidade(cidade) || "São Paulo" } });
  }

  // 5. 'que horas/data' -> hora
  if (/\b(que horas|que hora|qual a hora|que dia|qual a data|data de hoje|horário|horario)\b/i.test(text)) {
    tools.push({ name: "hora", payload: {} });
  }

  // 6. expressões numéricas entre aspas ou 'calcule' -> calcular
  const calcWordMatch = text.match(/\bcalcule\s+(.+)/i);
  const calcQuoteMatch = text.match(/["']([0-9\+\-\*\/\(\)\.\s]+)["']/);
  const calcMathMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?\s*[\+\-\*\/]\s*[0-9]+(?:\.[0-9]+)?)\b/);

  const ehDocumento = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{5}-?\d{3}\b/.test(text);
  const pedeHabilidade = GATILHO_HABILIDADE.test(text);
  if (!ehDocumento && (calcWordMatch || calcQuoteMatch || (calcMathMatch && !pedeHabilidade))) {
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

  // 8. biblioteca de habilidades (cálculo fino, texto, conversão, validação, web, sorteio)
  //    só entra quando nada mais casou, para não competir com clima/imagem/hora/câmbio

  if (!tools.length && pedeHabilidade) {
    tools.push({ name: "habilidade", payload: { texto: text.slice(0, 600) } });
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

async function callTool(tool: DetectedTool, conta: string | null = null) {
  if (tool.name === "habilidade") {
    const texto = String((tool.payload as any)?.texto ?? "");
    const base = Deno.env.get("SUPABASE_URL")!;
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    try {
      const resposta = await fetch(`${base}/functions/v1/skills`, {
        method: "POST",
        headers: { apikey: chave, authorization: `Bearer ${chave}`, "content-type": "application/json" },
        body: JSON.stringify({ texto }),
        signal: AbortSignal.timeout(15000),
      });
      const dados = await resposta.json();
      return dados;
    } catch (e) {
      return { ok: false, erro: `biblioteca de habilidades indisponível: ${String((e as Error)?.message ?? e).slice(0, 80)}` };
    }
  }

  if (tool.name === "widget") {
    const pedido = String((tool.payload as any)?.pedido ?? "").toLowerCase();
    const tipo = /clima|temperatura|chuva/.test(pedido) ? "clima"
      : /not[ií]cia|manchete|jornal/.test(pedido) ? "noticias"
      : /github|reposit[oó]rio|repo/.test(pedido) ? "github"
      : /m[uú]sica|v[ií]deo|player|som/.test(pedido) ? "midia"
      : /status|servidor|sistema|monitor/.test(pedido) ? "status"
      : /gr[aá]fico|m[eé]trica|lat[eê]ncia/.test(pedido) ? "metricas"
      : "texto";
    return { ok: true, tipo, titulo: `Widget de ${tipo}`, pedido };
  }

  if (tool.name === "arquivo") {
    const pedido = String((tool.payload as any)?.pedido ?? "");
    const ext = (pedido.match(/\.(txt|md|csv|json|html)\b/i)?.[1] ?? "txt").toLowerCase();
    const nome = (pedido.match(/\b(?:arquivo|file)\s+([\w.-]+\.(?:txt|md|csv|json|html))/i)?.[1])
      ?? (pedido.match(/\b([\w-]+\.(?:txt|md|csv|json|html))\b/i)?.[1])
      ?? `skynet-${Date.now()}.${ext}`;
    const conteudo = pedido.replace(/^[\s\S]{0,60}?\bcom\b/i, "").trim() || pedido.trim();
    const mime = ext === "json" ? "application/json" : ext === "csv" ? "text/csv" : ext === "html" ? "text/html" : ext === "md" ? "text/markdown" : "text/plain";
    return { ok: true, nome, mime, conteudo: conteudo.slice(0, 20000), bytes: conteudo.length };
  }

  if (tool.name === "github") {
    const repo = String((tool.payload as any)?.repo ?? "").trim();
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, erro: "não identifiquei dono/repositório no pedido" };
    const cab = { "user-agent": "SKYNETbot", accept: "application/vnd.github+json" };
    const [info, commits] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}`, { headers: cab, signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://api.github.com/repos/${repo}/commits?per_page=8`, { headers: cab, signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!info) return { ok: false, erro: `não consegui ler o repositório ${repo} (privado ou inexistente)` };
    return {
      ok: true,
      repo,
      descricao: info.description ?? "",
      estrelas: info.stargazers_count ?? 0,
      linguagem: info.language ?? "",
      atualizado: info.pushed_at ?? "",
      branch: info.default_branch ?? "main",
      commits: Array.isArray(commits) ? commits.map((c: any) => ({
        sha: String(c.sha ?? "").slice(0, 7),
        mensagem: String(c.commit?.message ?? "").split("\n")[0].slice(0, 110),
        autor: c.commit?.author?.name ?? "",
        quando: c.commit?.author?.date ?? "",
      })) : [],
    };
  }

  if (tool.name === "clima") {
    const cidade = String((tool.payload as any)?.cidade ?? "São Paulo");
    const r = await buscarClima(cidade);
    if (r.ok) return { ...r, cidade: r.cidade ?? cidade };
    // sem Open-Meteo, cai para o agente do Render (wttr.in)
  }

  if (tool.name === "print") {
    const r = await capturarTela(String(tool.payload?.url ?? "https://skynetchat-xi.vercel.app"));
    return { ...r, pedido: tool.payload?.url ?? "" };
  }
  if (tool.name === "midia") {
    const r = await resolverMidia({
      consulta: String(tool.payload?.consulta ?? ""),
      provedor: String(tool.payload?.provedor ?? ""),
      url: String(tool.payload?.url ?? ""),
    });
    return r;
  }
  if (tool.name === "infra") {
    const r = await infraTudo();
    return r;
  }
  if (tool.name === "memoria") {
    const acao = String(tool.payload?.acao ?? "buscar");
    const dono = String(conta ?? "").trim();
    if (!dono) return { ok: false, erro: "sem conta na sessão para guardar memória" };
    const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cab = {
      apikey: chaveServico,
      Authorization: `Bearer ${chaveServico}`,
      "Content-Type": "application/json",
    };
    try {
      if (acao === "salvar") {
        const texto = String(tool.payload?.texto ?? "").trim();
        if (texto.length < 4) return { ok: false, erro: "nada para guardar" };
        const chave = "nota-" + texto.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
        const r = await fetch(`${base}/rest/v1/acc_memory?on_conflict=account_id,chave`, {
          method: "POST",
          headers: { ...cab, Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ account_id: dono, chave, valor: texto.slice(0, 1000), tipo: "fato" }),
          signal: AbortSignal.timeout(9000),
        });
        const corpo = await r.text();
        if (!r.ok) return { ok: false, erro: `banco recusou (${r.status}): ${corpo.slice(0, 120)}` };
        return { ok: true, acao: "salvar", chave, valor: texto.slice(0, 200) };
      }
      const r = await fetch(
        `${base}/rest/v1/acc_memory?select=chave,valor,tipo,updated_at&account_id=eq.${dono}&order=updated_at.desc&limit=30`,
        { headers: cab, signal: AbortSignal.timeout(9000) },
      );
      if (!r.ok) return { ok: false, erro: `banco recusou (${r.status})` };
      const memoria = await r.json().catch(() => []);
      return { ok: true, acao: "buscar", memorias: Array.isArray(memoria) ? memoria : [] };
    } catch (e) {
      return { ok: false, erro: `memória indisponível: ${String((e as Error)?.message ?? e).slice(0, 100)}` };
    }
  }
  if (tool.name === "sistema") {
    const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const agente = (Deno.env.get("AGENT_URL") ?? "https://skynet-agent.onrender.com").replace(/\/+$/, "");
    const site = Deno.env.get("SITE_URL") ?? "https://skynetchat-xi.vercel.app";
    const sonda = async (nome: string, url: string) => {
      const t0 = Date.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { apikey: anon } });
        return { nome, ok: r.ok, status: r.status, ms: Date.now() - t0 };
      } catch (e) {
        return { nome, ok: false, erro: String(e).slice(0, 60), ms: Date.now() - t0 };
      }
    };
    const [statusFn, siteSonda, agenteSonda] = await Promise.all([
      fetch(`${base}/functions/v1/status`, { headers: { apikey: anon }, signal: AbortSignal.timeout(12000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      sonda("site", site),
      sonda("agente", `${agente}/health`),
    ]);
    return {
      ok: true,
      site: siteSonda,
      agente: agenteSonda,
      banco: statusFn?.banco ?? "sem resposta",
      integracoes: statusFn?.integracoes ?? [],
      funcoes: statusFn?.funcoes ?? [],
      numeros: statusFn?.numeros ?? {},
      chaves: statusFn?.chaves ?? {},
      verificado_em: new Date().toISOString(),
    };
  }
  if (tool.name === "navegar") {
    const alvo = String((tool.payload as Record<string, unknown>)?.url ?? "");
    if (alvo) return callTool({ name: "abrir", payload: { url: alvo } });
    const consulta = String((tool.payload as Record<string, unknown>)?.consulta ?? "");
    const busca = await callTool({ name: "web_pesquisar", payload: { consulta } });
    const primeira = Array.isArray((busca as Record<string, any>)?.resultados) ? (busca as Record<string, any>).resultados[0] : null;
    if (!primeira?.url) return { ok: false, erro: "nao achei site para abrir" };
    const pagina = await callTool({ name: "abrir", payload: { url: primeira.url } });
    return { ...(pagina as Record<string, unknown>), url: primeira.url, titulo: primeira.titulo ?? (pagina as any)?.titulo };
  }
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
    case "sistema": {
      const linhas = [
        `Site público: ${data.site?.ok ? "no ar" : "fora do ar"} (HTTP ${data.site?.status ?? data.site?.erro}, ${data.site?.ms}ms)`,
        `Servidor do agente (Render): ${data.agente?.ok ? "respondendo" : "sem resposta"} (${data.agente?.status ?? data.agente?.erro})`,
        `Banco: ${data.banco}`,
        `Integrações: ${(data.integracoes ?? []).map((i: any) => `${i.motor}=${i.ok ? "ok" : "falha"}`).join(", ") || "sem dados"}`,
        `Chaves configuradas: ${Object.entries(data.chaves ?? {}).map(([k, v]) => `${k}=${v ? "sim" : "não"}`).join(", ")}`,
        `Números: ${JSON.stringify(data.numeros ?? {})}`,
      ];
      fontes.push({ titulo: "Status do SKYNET (ao vivo)", url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/status` });
      return { fontes, contextText: `DIAGNÓSTICO DO PRÓPRIO SKYNET AGORA (${data.verificado_em}):\n${linhas.join("\n")}` };
    }
    case "infra": {
      const linha = (nome: string, r: any) =>
        `${nome}: ${r?.ok ? "ok" : "falha"} · ${String(r?.resumo ?? "").replace(new RegExp("^" + nome + ":\\s*", "i"), "")}`;
      const linhas = [
        linha("Supabase", data.supabase),
        linha("Vercel", data.vercel),
        linha("Render", data.render),
        data.supabase?.detalhe?.banco
          ? `Banco: ${data.supabase.detalhe.banco.contas} contas, ${data.supabase.detalhe.banco.conversas} conversas, ${data.supabase.detalhe.banco.mensagens} mensagens, ${data.supabase.detalhe.banco.memorias} memórias`
          : "",
        data.supabase?.detalhe?.gerenciamento?.funcoes
          ? `Funções edge: ${data.supabase.detalhe.gerenciamento.funcoes.ativas} ativas de ${data.supabase.detalhe.gerenciamento.funcoes.total}`
          : "",
      ].filter(Boolean);
      fontes.push({ titulo: "Supabase (projeto)", url: "https://supabase.com/dashboard/project/rkgwhhtenfozdwzpvxjj" });
      return {
        fontes,
        contextText: `INFRAESTRUTURA DO SKYNET CONSULTADA AO VIVO (${new Date().toISOString()}):\n${linhas.join("\n")}`,
      };
    }
    case "memoria": {
      if (data.acao === "salvar") {
        contextText = `MEMÓRIA: guardei o fato "${data.valor ?? ""}" com a chave ${data.chave ?? "?"}. Confirme ao usuário em uma frase.`;
      } else {
        const lista = (data.memorias ?? []).map((m: any) => `- ${m.chave}: ${m.valor}`);
        contextText = lista.length
          ? `MEMÓRIAS GUARDADAS DESTE USUÁRIO:\n${lista.join("\n")}`
          : "MEMÓRIA: nenhuma memória guardada ainda para este usuário.";
      }
      break;
    }
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
    case "github": {
      const commits = Array.isArray(data.commits) ? data.commits : [];
      if (data.ok) {
        fontes.push({ titulo: `GitHub ${data.repo}`, url: `https://github.com/${data.repo}` });
        contextText = `Repositório ${data.repo}: ${data.descricao || "sem descrição"} · ${data.estrelas} estrelas · linguagem ${data.linguagem || "?"} · branch ${data.branch} · atualizado ${String(data.atualizado).slice(0, 10)}.\nÚltimos commits:\n` +
          commits.map((c: any) => `- ${c.sha} ${c.mensagem} (${c.autor}, ${String(c.quando).slice(0, 10)})`).join("\n");
      } else contextText = `GitHub: ${data.erro ?? "sem dados"}`;
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
    case "imagem": {
      const url = String(data.url ?? data.imagem ?? data.data_url ?? data.dataUrl ?? "");
      if (url && !url.startsWith("data:")) fontes.push({ titulo: "Imagem gerada pelo SKYNET", url });
      contextText = `A imagem pedida ("${payload.prompt ?? ""}") foi gerada com sucesso e ja apareceu na tela do usuario. Responda em UMA frase curta, em portugues, dizendo o que foi gerado. Nunca cole URL, base64 nem JSON na resposta.`;
      break;
    }
    case "calcular": {
      fontes.push({ titulo: "Calculadora Skynet", url: "https://skynet-agent.onrender.com/tools/calcular" });
      contextText = `Resultado do cálculo de "${data.expressao || payload.expressao}": ${data.resultado}`;
      break;
    }
    case "habilidade": {
      const detalhe = String(data?.detalhe ?? "").trim();
      const bruto = data?.resultado ?? null;
      contextText = data?.ok
        ? `HABILIDADE "${data?.nome ?? data?.skill}" (pacote ${data?.pacote}) executada com sucesso. Resultado: ${detalhe || JSON.stringify(bruto)?.slice(0, 400)}. Responda usando exatamente esse resultado, sem recalcular.`
        : `A biblioteca de habilidades não respondeu a esse pedido (${String(data?.erro ?? "sem correspondência")}). Se for uma conta simples, resolva diretamente; senão diga o que faltou.`;
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
  let contaId: string | null = null;
  let nickname: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ") && authHeader.length > 30) {
    const { data } = await svc.auth.getUser(authHeader.slice(7));
    userId = data?.user?.id ?? null;
    const nick = data?.user?.user_metadata?.nickname;
    if (typeof nick === "string" && nick.trim()) nickname = nick.trim().slice(0, 40);
  }

  // ---- sessão do login por código secreto ----
  const conta = await contaDaSessao(req);
  if (conta) {
    contaId = conta.id;
    userId = conta.id;
    if (conta.nickname) nickname = conta.nickname;
    const uso = await consumirMensagem(conta.id, conta.role === "admin" ? "admin" : conta.tier);
    if (!uso.pode) {
      return json({
        ok: false,
        error: `Você usou as ${uso.limite} mensagens de hoje do plano ${conta.tier}. Amanhã libera de novo` +
          (conta.tier === "free" ? " ou ative o PRO para conversar sem esperar." : "."),
      }, 429);
    }
  }

  // ---- chamada interna (api/mcp): a conta vem assinada pelo service role ----
  // Só vale quando o Authorization é exatamente a chave de serviço do projeto,
  // então ninguém de fora consegue forjar "sou a conta X".
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const chamadaInterna = chaveServico.length > 20 && authHeader === `Bearer ${chaveServico}`;
  const contaDoHeader = chamadaInterna ? (req.headers.get("x-conta-id") ?? "").trim() : "";
  if (!conta && contaDoHeader) {
    const { data: c } = await svc
      .from("accounts")
      .select("id, tier, role, nickname, blocked")
      .eq("id", contaDoHeader)
      .maybeSingle();
    if (c && !c.blocked) {
      contaId = c.id;
      userId = c.id;
      if (c.nickname) nickname = c.nickname;
      const uso = await consumirMensagem(c.id, c.role === "admin" ? "admin" : c.tier);
      if (!uso.pode) {
        return json({
          ok: false,
          error: `Você usou as ${uso.limite} mensagens de hoje do plano ${c.tier}.`,
        }, 429);
      }
    }
  }

  // ---- visitante sem conta: limite por IP para não virar torneira de graça ----
  // conta por codigo (x-session) OU usuario logado no Supabase nao entram no limite anonimo por IP
  if (!conta && !userId && !(await liberar("chat-anon:" + ipDe(req), ANON_LIMIT, "hour"))) return respostaLimite();

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
  if (userId && !contaId && userEmbedding) {
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
  if (contaId) {
    if (convId) {
      const { data: conv } = await svc
        .from("conversations")
        .select("id")
        .eq("id", convId)
        .eq("account_id", contaId)
        .maybeSingle();
      if (!conv) convId = null; // conversa de outra conta/antiga: começa uma nova
    }
    if (!convId) {
      convId = crypto.randomUUID();
      const { error: cErr } = await svc
        .from("conversations")
        .insert({ id: convId, account_id: contaId, title: content.slice(0, 80) });
      if (cErr) return json({ ok: false, error: "Falha ao criar conversa." }, 500);
    }
  } else if (userId && convId) {
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
  if (convId && (userId || contaId)) {
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
    "NADA DE DESPEJAR CÓDIGO: quando o pedido é uma ação (abrir, tocar, pesquisar, gerar, checar), execute e responda com o resultado em texto. Nunca responda com HTML, CSS, JS ou um arquivo inteiro como se fosse entrega, a não ser que o usuário peça explicitamente por código.",
    "INFRAESTRUTURA: você consulta ao vivo Supabase (projeto, funções, contagens do banco), Vercel (projeto, último deploy, HTTP do site) e Render (saúde do agente) com a ferramenta 'infra'. Quando pedirem status, deploy ou números, use o dado real e cite a plataforma.",
    "MEMÓRIA: quando o usuário pedir para lembrar de algo, guarde com a ferramenta 'memoria' (ação salvar) e confirme em uma frase. Quando ele perguntar o que você sabe, consulte (ação buscar) e responda só o que estiver guardado, sem inventar.",
    "MÍDIA: o sistema tem player próprio (YouTube, Spotify, SoundCloud, Vimeo, MP4/MP3). Se o usuário pedir para tocar/abrir/colocar música, vídeo, filme ou playlist, o player é aberto automaticamente na conversa: confirme em UMA frase curta, com o título. Nunca responda apenas com o link.",
    "INTERFACE RICA: a tela renderiza markdown e widgets. Use **negrito** para o essencial, listas com '-' para passos, tabelas curtas quando comparar coisas, ```linguagem para trechos de código, ![descrição](URL) para mostrar uma imagem e links de imagem/vídeo (.mp4, YouTube, Vimeo, .mp3) em linha própria, que viram player. Não invente URL de mídia: use só as que vieram das ferramentas ou que você tem certeza que existem.",
  ];
  if (nickname) systemParts.push(`O apelido do usuário é "${nickname}". Trate-o por esse nome quando for natural.`);
  if (userId) {
    const minhas = await memoriasDaConta(userId);
    if (minhas.length) memories = [...minhas, ...memories];
  }
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

  // ---- respostas entregues por caminho direto (clima, widget, arquivo, midia, print, imagem) ----
  // Antes esses caminhos enviavam o texto e fechavam o stream sem gravar a resposta:
  // a conversa ficava com a pergunta do usuario e nenhuma resposta no historico.
  const salvarRespostaDireta = async (texto: string) => {
    if (!userId || !convId) return;
    const limpo = String(texto ?? "").trim();
    if (!limpo) return;
    await svc.from("messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: limpo.slice(0, 4000),
    });
  };

  // ---- memoria automatica do agente (memory id = usuario): guarda fatos duraveis do chat ----
  if (userId && content.length < 500 && /\b(lembre|lembra|guarde|anote|memorize|meu nome|eu sou|eu tenho|prefiro|minha|meu|moro|trabalho|nasci)\b/i.test(content)) {
    try { await svc.from("agent_memory").insert({ email: userId, texto: content.slice(0, 500) }); } catch { /* opcional */ }
  }

  // ---- streaming da resposta (SSE) ----
  const stream = new ReadableStream({
    async start(controller) {
      const legado = new URL(req.url).searchParams.get("protocol") === "legacy";
      const enviaEtapa = (o: Record<string, unknown>) => controller.enqueue(legado ? sse({ tool: o.ferramenta ?? o.tool, status: o.estado ?? o.status, ...o }) : tDados({ tipo: "etapa", ...o }));
      const enviaModelo = (modelo: string, tentativas: string[]) => controller.enqueue(legado ? sse({ modelo, tentativas }) : tDados({ tipo: "modelo", modelo, tentativas }));
      const enviaTexto = (d: string) => controller.enqueue(legado ? sse({ delta: d }) : tTexto(d));
      const enviaRaciocinio = (t: string) => controller.enqueue(legado ? sse({ raciocinio: t }) : tDados({ tipo: "raciocinio", texto: t }));
      const enviaErro = (e: string) => controller.enqueue(legado ? sse({ ok: false, error: e }) : tErro(e));
      const enviaFim = (meta: Record<string, unknown>) => controller.enqueue(legado ? sse({ done: true, ...meta }) : tFim(meta));
      const inicioDoPedido = Date.now();
      try {
        // Detecção e execução de ferramentas
        const toolsToRun = detectTools(content);
        const toolContexts: string[] = [];
        const fontesColetadas: { titulo: string; url: string }[] = [];
        let imagemEntregue = false;
        let midiaTocando: any = null;
        let entregaDireta: { quadro: any; texto: string } | null = null;
        let capturaEntregue: any = null;

        // Primeira etapa visivel: o plano do agente (o que ele escolheu fazer e por que).
        if (!toolsToRun.length) {
          enviaEtapa({
            ferramenta: "pensando",
            titulo: "Respondendo sem ferramentas",
            estado: "concluida",
            detalhe: "nenhuma ferramenta era necessaria para este pedido",
          });
        }
        if (toolsToRun.length) {
          enviaEtapa({
            ferramenta: "pensando",
            titulo: "Entendendo o pedido",
            estado: "concluida",
            detalhe: `Escolhi ${toolsToRun.length === 1 ? "1 ferramenta" : toolsToRun.length + " ferramentas"}: ${toolsToRun.map((x) => rotuloFerramenta(x.name)).join(" + ")}`,
          });
        }

        for (const tool of toolsToRun) {
          const t0 = Date.now();
          enviaEtapa({
            ferramenta: tool.name,
            titulo: rotuloFerramenta(tool.name),
            estado: "executando",
            detalhe: resumoDoPedido(tool),
            entrada: JSON.stringify(tool.payload).slice(0, 240),
          });
          let toolResult: any;
          try {
            toolResult = await callTool(tool, userId);
          } catch (e) {
            toolResult = { ok: false, erro: `ferramenta falhou: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
          }
          // se o agente do Render falhar (401/cota), a imagem sai pelo backend multiplexado
          if (tool.name === "imagem" && !toolResult?.ok) {
            try {
              const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/imagem`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ prompt: tool.payload?.prompt }),
                signal: AbortSignal.timeout(120_000),
              });
              const d = await r.json();
              if (d?.ok) toolResult = { ok: true, url: d.data_url, provedor: d.provedor, modelo: d.modelo };
            } catch { /* segue com erro do agente */ }
          }
          const { fontes, contextText } = processToolResult(tool.name, tool.payload, toolResult);

          if (toolResult && toolResult.ok) {
            if (tool.name === "print" && toolResult?.ok && toolResult.url) {
              capturaEntregue = toolResult;
              controller.enqueue(tDados({ tipo: "imagem", url: toolResult.url, legenda: `Print de ${toolResult.alvo}` }));
            }
            if (tool.name === "midia" && toolResult?.embed) {
              midiaTocando = toolResult;
              controller.enqueue(tDados({ tipo: "midia", provedor: toolResult.provedor, url: toolResult.url, embed: toolResult.embed, titulo: toolResult.titulo, aviso: toolResult.aviso }));
            }
            if (tool.name === "clima" && toolResult?.ok) {
              entregaDireta = {
                quadro: { tipo: "clima", dados: toolResult },
                texto: `Clima em **${toolResult.cidade}** agora: ${toolResult.agora?.temp}°C, ${toolResult.agora?.descricao}. Hoje fica entre ${toolResult.hoje?.min}°C e ${toolResult.hoje?.max}°C, com até ${toolResult.hoje?.chuva_max ?? 0}% de chance de chuva. O gráfico interativo está na conversa.`,
              };
            }
            if (tool.name === "widget" && toolResult?.ok) {
              entregaDireta = {
                quadro: { tipo: "widget", spec: { tipo: toolResult.tipo, titulo: toolResult.titulo } },
                texto: `Criei o **${toolResult.titulo}**. Ele já foi salvo no seu painel de widgets.`,
              };
            }
            if (tool.name === "arquivo" && toolResult?.ok) {
              entregaDireta = {
                quadro: { tipo: "arquivo", nome: toolResult.nome, mime: toolResult.mime, conteudo: toolResult.conteudo },
                texto: `Gerei o arquivo **${toolResult.nome}** (${toolResult.bytes} bytes). Baixe pelo cartão na conversa.`,
              };
            }
            if (tool.name === "imagem") {
              imagemEntregue = true;
              const url = String(toolResult.url ?? toolResult.imagem ?? toolResult.data_url ?? toolResult.dataUrl ?? "");
              if (url) controller.enqueue(legado ? sse({ imagem: url }) : tDados({ tipo: "imagem", url }));
            }
            for (const f of fontes) fontesColetadas.push(f);
            enviaEtapa({
              ferramenta: tool.name,
              titulo: rotuloFerramenta(tool.name),
              estado: "concluida",
              detalhe: tool.name === "web_pesquisar" ? `${fontes.length} fonte(s) encontrada(s)` : "resultado obtido",
              entrada: JSON.stringify(tool.payload).slice(0, 240),
              saida: resumirResultado(tool.name, toolResult),
              ms: Date.now() - t0,
              fontes,
              quando: new Date().toISOString(),
            });
            // "Vendo": abre a fonte e le o conteudo real (pula redirecionadores do Google News)
            if (tool.name === "web_pesquisar" && fontes.length && toolContexts.length < 3) {
              const candidatos = fontes.filter((f) => !/news\.google\.com|google\.com\/url|bing\.com/i.test(f.url)).slice(0, 2);
              for (const cand of candidatos) {
                const tv = Date.now();
                enviaEtapa({ ferramenta: "vendo", titulo: "Lendo a fonte", estado: "executando", detalhe: cand.url.slice(0, 120) });
                const lido = await callTool({ name: "abrir", payload: { url: cand.url } });
                const trecho = String((lido as Record<string, unknown>)?.texto ?? (lido as Record<string, unknown>)?.conteudo ?? (lido as Record<string, unknown>)?.markdown ?? "").replace(/\s+/g, " ").trim();
                const util = lido?.ok && trecho.length >= 200;
                enviaEtapa({
                  ferramenta: "vendo",
                  titulo: "Lendo a fonte",
                  estado: util ? "concluida" : "falhou",
                  detalhe: util ? `${cand.titulo || cand.url} · ${trecho.length} caracteres lidos` : `pagina sem conteudo util (${trecho.length} caracteres)`,
                  ms: Date.now() - tv,
                  fontes: util ? [cand] : [],
                  erro: util ? undefined : "nao consegui extrair o texto da pagina",
                });
                if (util) {
                  toolContexts.push(`CONTEUDO DA PAGINA ${cand.url}\n${trecho.slice(0, 2400)}`);
                  break;
                }
              }
            }
          } else {
            enviaEtapa({
              ferramenta: tool.name,
              titulo: rotuloFerramenta(tool.name),
              estado: "falhou",
              detalhe: "indisponivel agora",
              entrada: JSON.stringify(tool.payload).slice(0, 240),
              saida: String((toolResult as Record<string, unknown>)?.erro ?? (toolResult as Record<string, unknown>)?.error ?? "").slice(0, 160),
              erro: "pesquisa indisponível agora",
              ms: Date.now() - t0,
              fontes: [],
              quando: new Date().toISOString(),
            });
          }

          if (contextText) {
            toolContexts.push(contextText);
          }
        }

        if (entregaDireta) {
          controller.enqueue(tDados(entregaDireta.quadro));
          enviaTexto(entregaDireta.texto);
          await salvarRespostaDireta(entregaDireta.texto);
          enviaFim({ conversationId: convId, model: entregaDireta.quadro.tipo, pedido: model, auto: true, fallback: false, tentativas: [] });
          controller.close();
          return;
        }

        if (midiaTocando) {
          const titulo = String(midiaTocando.titulo || "").slice(0, 90);
          const textoMidia = `${midiaTocando.aviso ? midiaTocando.aviso + " " : ""}Tocando agora${titulo ? `: **${titulo}**` : ""} (${midiaTocando.provedor}). O player está na conversa.`;
          enviaTexto(textoMidia);
          await salvarRespostaDireta(textoMidia);
          enviaFim({ conversationId: convId, model: "midia", pedido: model, auto: true, fallback: false, tentativas: [] });
          controller.close();
          return;
        }

        if (capturaEntregue) {
          const textoPrint = `Aqui está o print de ${capturaEntregue.alvo} (${capturaEntregue.provedor}).`;
          enviaTexto(textoPrint);
          await salvarRespostaDireta(textoPrint);
          enviaFim({ conversationId: convId, model: "print", pedido: model, auto: true, fallback: false, tentativas: [] });
          controller.close();
          return;
        }

        if (imagemEntregue) {
          const textoImagem = "Pronto, a imagem foi gerada. Se quiser outra versão, é só pedir.";
          enviaTexto(textoImagem);
          await salvarRespostaDireta(textoImagem);
          enviaFim({ conversationId: convId, model: "imagem", pedido: model, auto: true, fallback: false, tentativas: [] });
          controller.close();
          return;
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

        enviaModelo(usado || "auto", tentativasFeitas);

        if (!res || !res.body) {
          enviaErro(`Nenhum modelo respondeu (${ultimoErro}).`);
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
              const pensamento = parsed?.choices?.[0]?.delta?.reasoning_content ?? parsed?.choices?.[0]?.delta?.reasoning;
              if (pensamento) enviaRaciocinio(String(pensamento));
              if (delta) {
                full += delta;
                enviaTexto(delta);
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
          {
            const citou = fontesColetadas.some((f) => {
              try { return full.includes(new URL(f.url).hostname.replace(/^www\./, "")); } catch { return false; }
            });
            enviaEtapa({
              ferramenta: "conferindo",
              titulo: "Conferindo a resposta",
              estado: "concluida",
              detalhe: fontesColetadas.length
                ? citou
                  ? `resposta conferida e apoiada em ${fontesColetadas.length} fonte(s)`
                  : `respondi com ${fontesColetadas.length} fonte(s) coletada(s)`
                : "respondi sem ferramentas",
              ms: Date.now() - (inicioDoPedido ?? Date.now()),
            });
          }
          enviaFim({
            conversationId: convId,
            model: usado,
            pedido: model,
            auto: rota.auto,
            fallback: !rota.auto && usado !== model,
            tentativas: tentativasFeitas,
          });
        } else {
          enviaErro("O provedor de IA não retornou conteúdo.");
        }
        controller.close();
      } catch (err) {
        enviaErro("Sem conexão com o provedor de IA.");
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
});
