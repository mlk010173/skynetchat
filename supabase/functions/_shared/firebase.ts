// Firestore via REST, sem dependências: assina um JWT RS256 com a service account
// e troca por um access token do Google. Usado para espelhar contas e fila de e-mails
// no Firebase/Firestore quando o secret FIREBASE_SERVICE_ACCOUNT existir.
//
// Se o secret não existir, tudo aqui vira no-op silencioso: o app continua no Supabase.

type ContaServico = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlTxt = (txt: string) => b64url(new TextEncoder().encode(txt));

function conta(): ContaServico | null {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") ?? "";
  if (!raw.trim()) return null;
  try {
    const j = JSON.parse(raw);
    if (!j.project_id || !j.client_email || !j.private_key) return null;
    // o formulário de secrets costuma salvar \n literais
    j.private_key = String(j.private_key).replace(/\\n/g, "\n");
    return j as ContaServico;
  } catch {
    return null;
  }
}

export const firestoreAtivo = () => conta() !== null;

let cache: { token: string; expira: number } | null = null;

async function tokenAcesso(): Promise<string | null> {
  const c = conta();
  if (!c) return null;
  const agora = Math.floor(Date.now() / 1000);
  if (cache && cache.expira > agora + 60) return cache.token;

  const pem = c.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (ch) => ch.charCodeAt(0));
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const Cabecalho = b64urlTxt(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlTxt(JSON.stringify({
    iss: c.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  }));
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chave,
    new TextEncoder().encode(`${Cabecalho}.${claims}`),
  );
  const jwt = `${Cabecalho}.${claims}.${b64url(new Uint8Array(assinatura))}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.access_token) return null;
  cache = { token: d.access_token, expira: agora + (d.expires_in ?? 3600) };
  return d.access_token;
}

type Valor = string | number | boolean | null | { [k: string]: Valor } | Valor[];

const paraFirestore = (v: Valor): Record<string, unknown> => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraFirestore) } };
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraFirestore(x as Valor)])),
    },
  };
};

const daFirestore = (f: Record<string, any>): unknown => {
  if (!f) return null;
  if ("stringValue" in f) return f.stringValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  if ("nullValue" in f) return null;
  if ("arrayValue" in f) return (f.arrayValue.values ?? []).map(daFirestore);
  if ("mapValue" in f) {
    return Object.fromEntries(Object.entries(f.mapValue.fields ?? {}).map(([k, v]) => [k, daFirestore(v as any)]));
  }
  return null;
};

/** Grava/atualiza um documento. Nunca lança: devolve se deu certo. */
export async function firestoreGravar(
  colecao: string,
  id: string,
  dados: Record<string, Valor>,
): Promise<boolean> {
  const c = conta();
  if (!c) return false;
  try {
    const t = await tokenAcesso();
    if (!t) return false;
    const url = `https://firestore.googleapis.com/v1/projects/${c.project_id}/databases/(default)/documents/` +
      `${encodeURIComponent(colecao)}/${encodeURIComponent(id)}?updateMask.fieldPaths=` +
      Object.keys(dados).map((k) => encodeURIComponent(k)).join("&updateMask.fieldPaths=");
    const r = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, paraFirestore(v)])) }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Lê um documento. Devolve null se não existir ou se o Firestore estiver desligado. */
export async function firestoreLer(colecao: string, id: string): Promise<Record<string, unknown> | null> {
  const c = conta();
  if (!c) return null;
  try {
    const t = await tokenAcesso();
    if (!t) return null;
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${c.project_id}/databases/(default)/documents/` +
        `${encodeURIComponent(colecao)}/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${t}` } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    return Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, daFirestore(v as any)]));
  } catch {
    return null;
  }
}

/** Conta documentos de uma coleção (para o painel de saúde). */
export async function firestoreContar(colecao: string): Promise<number | null> {
  const c = conta();
  if (!c) return null;
  try {
    const t = await tokenAcesso();
    if (!t) return null;
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${c.project_id}/databases/(default)/documents:runAggregationQuery`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          structuredAggregationQuery: {
            structuredQuery: { from: [{ collectionId: colecao }] },
            aggregations: [{ count: {}, alias: "total" }],
          },
        }),
      },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const linha = (d ?? [])[0];
    const total = linha?.result?.aggregateFields?.total?.integerValue;
    return total === undefined ? null : Number(total);
  } catch {
    return null;
  }
}

// ---------- Cloudflare Turnstile ----------
export const turnstileAtivo = () => !!(Deno.env.get("TURNSTILE_SECRET") ?? "");

/** Valida o token do widget Turnstile. Sem secret configurado, libera (modo espelho). */
export async function turnstileValidar(token: string, ip?: string): Promise<{ ok: boolean; motivo?: string }> {
  const secret = Deno.env.get("TURNSTILE_SECRET") ?? "";
  if (!secret) return { ok: true, motivo: "turnstile desligado" };
  if (!token) return { ok: false, motivo: "token do Turnstile ausente" };
  const corpo = new URLSearchParams({ secret, response: token });
  if (ip) corpo.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: corpo,
    });
    const d = await r.json();
    return d.success ? { ok: true } : { ok: false, motivo: (d["error-codes"] ?? []).join(",") || "falhou" };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}
