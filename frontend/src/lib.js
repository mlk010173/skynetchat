// Ligação real com o backend Supabase (Edge Functions + Auth + Realtime).
import { createClient } from "@supabase/supabase-js";

export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const API = `${SUPA_URL}/functions/v1`;

export const supabase = createClient(SUPA_URL, SUPA_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "skynet-session" },
});

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Chama uma edge function e devolve o JSON. */
export async function api(path, opts = {}) {
  const session = await getSession();
  const res = await fetch(`${SUPA_URL}/functions/v1/${path}`, {
    method: opts.method ?? "GET",
    headers: {
      apikey: SUPA_ANON,
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return res.json().catch(() => ({ ok: false, error: `Resposta inválida da função ${path}.` }));
}

/** Chat em streaming SSE (resposta ao vivo, digitação em tempo real). */
export async function streamChat({ conversationId, content, model }, handlers) {
  const session = await getSession();
  let res;
  try {
    res = await fetch(`${SUPA_URL}/functions/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPA_ANON,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ conversationId, content, model }),
    });
  } catch {
    handlers.onError("Sem conexão com o servidor.");
    return;
  }
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/event-stream")) {
    const data = await res.json().catch(() => null);
    if (data?.error) handlers.onError(String(data.error));
    else if (!res.ok) handlers.onError(`Erro do servidor (HTTP ${res.status}).`);
    else handlers.onError("Resposta inesperada do servidor.");
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let recebeu = false;
  let terminou = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // os quadros do AI SDK terminam em "\n" simples; o formato antigo usa "\n\n"
    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";
    for (const bruta of linhas) {
      const linha = bruta.trim();
      if (!linha) continue;
      if (linha.startsWith("data:")) {
        try {
          const ev = JSON.parse(linha.slice(5).trim());
          if (ev.tool && handlers.onTool) handlers.onTool(ev);
          if (ev.imagem && handlers.onImage) handlers.onImage(String(ev.imagem));
          if (ev.delta) { recebeu = true; handlers.onDelta(String(ev.delta)); }
          if (ev.done) { terminou = true; handlers.onDone({ conversationId: ev.conversationId ?? null, model: ev.model }); }
          if (ev.error) handlers.onError(String(ev.error));
        } catch { /* quadro parcial */ }
        continue;
      }
      const sep = linha.indexOf(":");
      if (sep <= 0) continue;
      const tipo = linha.slice(0, sep);
      const corpo = linha.slice(sep + 1);
      try {
        if (tipo === "0") { recebeu = true; handlers.onDelta(JSON.parse(corpo)); }
        else if (tipo === "2") {
          const itens = JSON.parse(corpo);
          for (const it of (Array.isArray(itens) ? itens : [itens])) {
            if (!it) continue;
            if (it.tipo === "etapa" && handlers.onTool) {
              handlers.onTool({ tool: it.ferramenta, status: it.estado, detalhe: it.detalhe, ms: it.ms, fontes: it.fontes, erro: it.erro, quando: it.quando });
            } else if (it.tipo === "imagem" && handlers.onImage) {
              handlers.onImage(String(it.url ?? it.imagem ?? ""));
            } else if (it.tipo === "raciocinio" && handlers.onReason) {
              handlers.onReason(String(it.texto ?? ""));
            } else if (it.tipo === "modelo" && handlers.onModelo) {
              handlers.onModelo(it);
            }
          }
        }
        else if (tipo === "3") handlers.onError(String(JSON.parse(corpo)));
        else if (tipo === "d") {
          const meta = JSON.parse(corpo) || {};
          terminou = true;
          handlers.onDone(meta.messageMetadata ?? meta);
        }
      } catch { /* quadro parcial */ }
    }
  }
  if (!recebeu && !terminou) handlers.onError("Nao foi possivel responder agora.");
}

/** Auth por código de 12 dígitos (modelo do site real). */
export async function codeAuth(action, payload = {}, token = null) {
  const res = await fetch(`${SUPA_URL}/functions/v1/auth-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPA_ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Resposta inválida." }));
  if (data.ok && data.session) {
    await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }
  return data;
}

let MODEL_LIST = [];
export function setModelList(list) { MODEL_LIST = Array.isArray(list) ? list : []; }

/** Chama streamChat e, se o modelo falhar sem produzir texto, tenta o proximo da reserva. */
export async function streamChatAuto({ conversationId, content, model }, handlers) {
  const { fallbackChain } = await import("./models.js");
  if (!MODEL_LIST.length) {
    try { const d = await api("models"); if (d?.ok && Array.isArray(d.models) && d.models.length) MODEL_LIST = d.models; } catch { /* segue com o escolhido */ }
  }
  const automatico = !model || model === "auto" || model === "melhor";
  // no modo automatico quem faz failover e o roteador do servidor; insistir no cliente
  // trocava o "auto" por modelos inadequados (llama-guard, ising-calibration).
  const chain = automatico ? [model || "auto"] : fallbackChain(model, MODEL_LIST.length ? MODEL_LIST : [model]);
  let ultimoErro = "Nao foi possivel responder agora.";
  for (const tentativa of chain) {
    let recebeuTexto = false;
    const r = await new Promise((resolve) => {
      streamChat({ conversationId, content, model: tentativa }, {
        onTool: (toolEv) => handlers.onTool?.(toolEv),
        onImage: (url) => handlers.onImage?.(url),
        onReason: (txt) => handlers.onReason?.(txt),
        onModelo: (info) => handlers.onModelo?.(info),
        onDelta: (t) => { recebeuTexto = true; handlers.onDelta(t); },
        onDone: (info) => resolve({ ok: true, info: info ?? {} }),
        onError: (msg, configured) => resolve({ ok: false, erro: msg, configured }),
      });
    });
    if (r.ok) { handlers.onDone({ ...(r.info ?? {}), model: tentativa, switched: tentativa !== model }); return; }
    ultimoErro = r.erro ?? ultimoErro;
    if (recebeuTexto || r.configured === false) break;   // ja respondeu algo, ou IA nem configurada
  }
  handlers.onError(ultimoErro);
}


// ---------- ferramentas do agente (Render) ----------
export const AGENT_URL = String(import.meta.env.VITE_AGENT_URL ?? "").replace(/\/+$/, "");

/** GET no agente (ex.: /tools). */
export async function agentGet(caminho) {
  if (!AGENT_URL) return { ok: false, erro: "agente nao configurado (VITE_AGENT_URL)" };
  try {
    const res = await fetch(`${AGENT_URL}${caminho}`, { headers: { accept: "application/json" } });
    return await res.json();
  } catch { return { ok: false, erro: "sem conexao com o agente" }; }
}

/** Executa uma ferramenta do agente pelo backend (a ponte `agent` guarda o token). */
export async function runTool(nome, args = {}) {
  const session = await getSession();
  try {
    const res = await fetch(`${API}/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPA_ANON,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ tool: nome, payload: args ?? {} }),
    });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, erro: `Erro do servidor (HTTP ${res.status}).` };
    return data.ok ? data.resultado : { ok: false, erro: data.error };
  } catch { return { ok: false, erro: "sem conexao com o agente" }; }
}

/** Resposta completa (consome o SSE) para quando o texto ja esta pronto. */
export async function askOnce({ conversationId, content, model }) {
  const session = await getSession();
  const res = await fetch(`${SUPA_URL}/functions/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPA_ANON, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ conversationId, content, model }),
  });
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/event-stream")) {
    const d = await res.json().catch(() => null);
    return { ok: false, erro: d?.error ?? `Erro do servidor (HTTP ${res.status}).` };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = ""; let texto = ""; let convId = conversationId ?? null; let usado = model;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const linhas = buf.split("\n");
    buf = linhas.pop() ?? "";
    for (const l of linhas) {
      const p = l.startsWith("data:") ? l.slice(5).trim() : "";
      if (!p || p === "[DONE]") continue;
      try {
        const j = JSON.parse(p);
        if (typeof j.delta === "string") texto += j.delta;
        if (j.conversationId) convId = j.conversationId;
        if (j.model) usado = j.model;
      } catch { /* ignora linha parcial */ }
    }
  }
  return { ok: true, texto, conversationId: convId, model: usado };
}
