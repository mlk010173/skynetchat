/**
 * Logica pura de verificacao de identidade Firebase.
 * Sem rede, sem Deno, sem segredos — testavel por node --test.
 */

export const FIREBASE_ISS = (projectId) => `https://securetoken.google.com/${projectId}`;

export function b64urlToBytes(input) {
  if (typeof input !== "string" || input.length === 0) throw new Error("base64url vazio");
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error("base64url invalido");
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function b64urlToJson(input) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(input)));
}

/** Divide o token e valida a estrutura. Nao confia em nada do conteudo ainda. */
export function parseIdToken(token) {
  if (typeof token !== "string") throw new Error("token precisa ser texto");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("token malformado");
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);
  if (!header || typeof header !== "object") throw new Error("cabecalho invalido");
  if (!payload || typeof payload !== "object") throw new Error("payload invalido");
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: parts[2] };
}

/** Rejeita algoritmos que nao sejam RS256 (bloqueia alg:none e HS256 com chave publica). */
export function assertRs256(header) {
  if (!header || header.alg !== "RS256") throw new Error(`algoritmo nao permitido: ${header && header.alg}`);
  if (header.kid !== undefined && typeof header.kid !== "string") throw new Error("kid invalido");
  if (header.crit !== undefined) throw new Error("cabecalho crit nao suportado");
  return true;
}

/** Valida as reivindicacoes obrigatorias do Firebase ID token. */
export function validateFirebaseClaims(payload, opts = {}) {
  const projectId = opts.projectId;
  const now = Number.isFinite(opts.nowSec) ? opts.nowSec : Math.floor(Date.now() / 1000);
  const skew = Number.isFinite(opts.clockSkew) ? opts.clockSkew : 60;

  if (!projectId) return { ok: false, error: "projectId ausente" };
  if (!payload || typeof payload !== "object") return { ok: false, error: "payload ausente" };

  if (payload.iss !== FIREBASE_ISS(projectId)) return { ok: false, error: "issuer invalido" };
  if (payload.aud !== projectId) return { ok: false, error: "audience invalido" };
  if (typeof payload.sub !== "string" || payload.sub.length < 1) return { ok: false, error: "sub ausente" };
  if (payload.user_id !== payload.sub) return { ok: false, error: "user_id diverge do sub" };
  if (!Number.isFinite(payload.exp)) return { ok: false, error: "exp ausente" };
  if (payload.exp <= now - skew) return { ok: false, error: "token expirado" };
  if (!Number.isFinite(payload.iat)) return { ok: false, error: "iat ausente" };
  if (payload.iat > now + skew) return { ok: false, error: "token emitido no futuro" };
  if (payload.email !== undefined && typeof payload.email !== "string") return { ok: false, error: "email invalido" };

  return { ok: true };
}

export function identityKey(payload) {
  if (!payload || typeof payload.sub !== "string" || !payload.sub) throw new Error("sub ausente");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  return {
    firebaseUid: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    provider: typeof payload.firebase?.sign_in_provider === "string" ? payload.firebase.sign_in_provider : "desconhecido",
  };
}

/** Mapeamento seguro: so aceita vinculo por e-mail quando o provedor afirma que o e-mail foi verificado. */
export function decideMapping(identity, existing) {
  if (!identity) return { action: "reject", reason: "identidade ausente" };
  if (existing && existing.firebase_uid === identity.firebaseUid) return { action: "reuse", reason: "vinculo existente" };
  if (!identity.email) return { action: "reject", reason: "sem e-mail para mapear" };
  if (!identity.emailVerified) return { action: "reject", reason: "e-mail nao verificado pelo provedor" };
  return { action: "link", reason: "vinculo novo por e-mail verificado" };
}
