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
