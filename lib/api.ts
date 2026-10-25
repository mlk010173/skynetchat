// Helpers para chamar as Edge Functions do Supabase (backend real do projeto).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Prefixo do app quando publicado em subcaminho (ex.: GitHub Pages /skynetchat). */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const API = `${SUPABASE_URL}/functions/v1`;

export interface ApiOpts {
  method?: string;
  body?: unknown;
  token?: string | null;
}

/** Chama uma edge function e devolve o JSON da resposta. */
export async function api(path: string, opts: ApiOpts = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return res.json().catch(() => ({ ok: false, error: `Resposta inválida da função ${path}.` }));
}

/** Chama a edge function de chat consumindo o STREAM SSE (resposta ao vivo). */
export async function streamChat(
  body: { conversationId: string | null; content: string; model: string },
  token: string | null,
  handlers: {
    onDelta: (text: string) => void;
    onDone: (info: { conversationId: string | null; model?: string }) => void;
    onError: (message: string, configured?: boolean) => void;
  },
) {
  const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let res: Response;
  try {
    res = await fetch(`${SUPABASE}/functions/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    handlers.onError("Sem conexão com o servidor.");
    return;
  }

  // caminho de erro honesto (JSON) — ex.: IA não configurada, rate limit
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/event-stream")) {
    const data = await res.json().catch(() => null);
    if (data?.error) handlers.onError(String(data.error), data.configured === false);
    else if (!res.ok) handlers.onError(`Erro do servidor (HTTP ${res.status}).`);
    else handlers.onError("Resposta inesperada do servidor.");
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.delta) handlers.onDelta(String(ev.delta));
        else if (ev.done) handlers.onDone({ conversationId: ev.conversationId ?? null, model: ev.model });
        else if (ev.error) handlers.onError(String(ev.error));
      } catch { /* fragmento parcial */ }
    }
  }
}
