/**
 * Ponte de identidade Firebase -> Supabase.
 * Nunca emite sessao: apenas verifica o ID token e devolve o vinculo seguro.
 * Sem FIREBASE_PROJECT_ID configurado responde 503 nomeando a configuracao ausente.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseIdToken, assertRs256, validateFirebaseClaims, identityKey, decideMapping, b64urlToBytes } from "./logic.mjs";

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

async function verifySignature(token: ReturnType<typeof parseIdToken>) {
  const r = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("jwks indisponivel");
  const jwks = await r.json();
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const candidates = token.header.kid ? keys.filter((k: any) => k.kid === token.header.kid) : keys;
  if (candidates.length === 0) throw new Error("chave de assinatura nao encontrada");

  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const ok = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        b64urlToBytes(token.signature),
        new TextEncoder().encode(token.signingInput),
      );
      if (ok) return true;
    } catch { /* tenta a proxima chave */ }
  }
  throw new Error("assinatura invalida");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo nao permitido" }, 405);

  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  if (!projectId) {
    return json({ ok: false, erro: "integracao nao configurada", faltando: ["FIREBASE_PROJECT_ID"] }, 503);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, erro: "json invalido" }, 400); }
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || idToken.length < 32 || idToken.length > 8192) {
    return json({ ok: false, erro: "idToken ausente ou fora do limite" }, 400);
  }

  try {
    const token = parseIdToken(idToken);
    assertRs256(token.header);
    const claims = validateFirebaseClaims(token.payload, { projectId });
    if (!claims.ok) return json({ ok: false, erro: claims.error }, 401);
    await verifySignature(token);

    const identity = identityKey(token.payload);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: existing, error: qErr } = await admin
      .from("firebase_identities")
      .select("firebase_uid, supabase_user_id, email, email_verified")
      .eq("firebase_uid", identity.firebaseUid)
      .maybeSingle();
    if (qErr) return json({ ok: false, erro: "falha ao consultar vinculo" }, 500);

    const decision = decideMapping(identity, existing);
    if (decision.action === "reject") return json({ ok: false, erro: decision.reason }, 403);
    if (decision.action === "reuse") {
      return json({ ok: true, mapped: true, supabase_user_id: existing!.supabase_user_id, email: existing!.email, origem: "vinculo_existente" });
    }

    // Vinculo novo: exige usuario Supabase ja existente com o mesmo e-mail verificado.
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (lErr) return json({ ok: false, erro: "falha ao listar usuarios" }, 500);
    const match = (list?.users || []).find((u: any) => (u.email || "").toLowerCase() === identity.email);
    if (!match) return json({ ok: false, erro: "nao existe conta Supabase com este e-mail", acao: "cadastre-se primeiro" }, 404);

    const { error: iErr } = await admin.from("firebase_identities").upsert(
      {
        firebase_uid: identity.firebaseUid,
        supabase_user_id: match.id,
        email: identity.email,
        email_verified: identity.emailVerified,
        provider: identity.provider,
      },
      { onConflict: "firebase_uid" },
    );
    if (iErr) return json({ ok: false, erro: "falha ao gravar vinculo" }, 500);

    return json({ ok: true, mapped: true, supabase_user_id: match.id, email: identity.email, origem: "vinculo_novo" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    return json({ ok: false, erro: msg }, 401);
  }
});
