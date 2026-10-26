// auth-code — autenticação por código de 12 dígitos (modelo do skynetchat.net real)
// signup: gera código, cria usuário, retorna código + sessão Supabase real
// login: valida código (bcrypt) e emite sessão real
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PEPPER = Deno.env.get("AUTH_CODE_PEPPER")!;

const admin = createClient(SUPA_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const LIMITE_HORA = 12;

const enc = new TextEncoder();
async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(PEPPER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function aesDecrypt(encB64: string): Promise<string> {
  const raw = Uint8Array.from(atob(encB64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const key = await crypto.subtle.importKey("raw", enc.encode(PEPPER).slice(0, 32), "AES-GCM", false, ["decrypt"]);
  const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(out);
}

async function aesEncrypt(plain: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(PEPPER).slice(0, 32), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

function genCode(): string {
  const d = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(d, (n) => String(n % 10)).join("");
}

async function mintSession(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) return { error: "session_link: " + (error ? JSON.stringify(error) : "no token") };
  const r = await fetch(`${SUPA_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ token_hash: data.properties.hashed_token, type: "magiclink" }),
  });
  const j = await r.json();
  if (!r.ok) return { error: j.msg || "session_verify" };
  return { session: { access_token: j.access_token, refresh_token: j.refresh_token }, user: j.user };
}

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

async function ipDoPedido(req: Request): Promise<string> {
  const bruto = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "desconhecido";
  return bruto.split(",")[0].trim();
}


async function dentroDoLimite(ip: string): Promise<boolean> {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("anon_requests").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", desde);
  await admin.from("anon_requests").insert({ ip });
  return (count ?? 0) < LIMITE_HORA;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" } });
  if (req.method === "GET") return json(200, { ok: true, turnstile_ativo: false, limite_por_hora: LIMITE_HORA, acoes: ["signup", "login", "recover"] });
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "bad_request" }); }
  const action = String(body.action || "");

  // Recuperação por código fica desativada até haver comprovação real do e-mail.
  // Nunca devolva um código novo nem uma sessão apenas com o e-mail de recuperação.
  if (action === "newcode") return json(410, { ok: false, error: "recovery_not_configured", message: "A recuperação segura ainda não está configurada. O código existente não foi alterado." });

  if (action === "signup" || action === "recover") {
    const ip = await ipDoPedido(req);
    if (!(await dentroDoLimite(ip))) return json(429, { ok: false, error: "muitas tentativas por hora" });
  }

  if (action === "signup") {
    const recoveryEmail = typeof body.recovery_email === "string" && /.+@.+\..+/.test(body.recovery_email) ? body.recovery_email : null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = genCode();
      const lookup = await hmacHex(code);
      const existing = await admin.from("auth_codes").select("id").eq("code_lookup", lookup).maybeSingle();
      if (existing.data) continue;
      const email = `skynet.${lookup.slice(0, 16)}@auth.skynet.chat`;
      const { data: created, error: uerr } = await admin.auth.admin.createUser({
        email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: false,
      });
      if (uerr || !created?.user) return json(500, { ok: false, error: "user_create" });
      const { error: ierr } = await admin.from("auth_codes").insert({
        user_id: created.user.id, email,
        code_hash: bcrypt.hashSync(code, 10),
        code_lookup: lookup,
        code_enc: await aesEncrypt(code),
        recovery_email: recoveryEmail,
      });
      if (ierr) return json(500, { ok: false, error: "code_store" });
      const mint = await mintSession(email);
      if (mint.error) return json(500, { ok: false, error: mint.error });
      return json(200, { ok: true, code, session: mint.session });
    }
    return json(500, { ok: false, error: "code_collision" });
  }

  if (action === "get_code") {
    const bearer = req.headers.get("authorization") ?? "";
    const token = bearer.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { ok: false, error: "sem sessao" });
    const anon = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u, error: uerr } = await anon.auth.getUser(token);
    if (uerr || !u?.user) return json(401, { ok: false, error: "sessao invalida" });
    const { data: row } = await admin.from("auth_codes").select("code_enc").eq("user_id", u.user.id).maybeSingle();
    if (!row?.code_enc) return json(404, { ok: false, error: "sem codigo" });
    return json(200, { ok: true, code: await aesDecrypt(row.code_enc) });
  }

  if (action === "set_recovery_email") {
    const bearer = req.headers.get("authorization") ?? "";
    const token = bearer.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { ok: false, error: "sem sessao" });
    const anon = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u, error: uerr } = await anon.auth.getUser(token);
    if (uerr || !u?.user) return json(401, { ok: false, error: "sessao invalida" });
    const email = typeof body.email === "string" && /.+@.+\..+/.test(body.email) ? body.email.trim() : null;
    if (!email) return json(400, { ok: false, error: "email invalido" });
    const { error: upderr } = await admin.from("auth_codes").update({ recovery_email: email }).eq("user_id", u.user.id);
    if (upderr) return json(500, { ok: false, error: "falha ao salvar" });
    return json(200, { ok: true, email });
  }

  if (action === "login") {
    const ip = await ipDoPedido(req);
    const desde = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from("auth_attempts").select("ip", { count: "exact", head: true }).eq("ip", ip).gte("at", desde);
    if ((count ?? 0) >= 10) return json(429, { ok: false, error: "muitas tentativas. tente novamente em alguns minutos" });
    await admin.from("auth_attempts").insert({ ip });
    const code = String(body.code || "").replace(/\D/g, "");
    if (code.length !== 12) return json(400, { ok: false, error: "codigo invalido" });
    const lookup = await hmacHex(code);
    const { data: row } = await admin.from("auth_codes").select("email, code_hash").eq("code_lookup", lookup).maybeSingle();
    if (!row || !bcrypt.compareSync(code, row.code_hash)) return json(401, { ok: false, error: "codigo invalido" });
    const mint = await mintSession(row.email);
    if (mint.error) return json(500, { ok: false, error: mint.error });
    return json(200, { ok: true, session: mint.session });
  }

  if (action === "recover") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/.+@.+\..+/.test(email)) return json(400, { ok: false, error: "email invalido" });
    // Resposta uniforme: não revelar se existe uma conta com esse e-mail.
    // O envio precisa ser implementado e verificado antes de habilitar a recuperação.
    return json(200, { ok: true, pending: "smtp" });
  }

  return json(400, { ok: false, error: "acao desconhecida" });
});
