// Edge Function: auth — contas por código secreto + recuperação por e-mail.
// Tudo que o app chama de /api/access-code, /api/session, /api/recovery/*,
// /api/security/new-code e /api/support cai aqui (via ponte no frontend).
//
// Segurança:
//  - código de 12 dígitos guardado em AES-256-GCM (chave no secret CODE_ENC_KEY);
//  - sessão = token opaco de 32 bytes, revogável;
//  - e-mail sai por fila com limite diário do plano free (5/dia por conta);
//  - respostas de recuperação são sempre neutras (não revelam se o e-mail existe).
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  firestoreAtivo,
  firestoreContar,
  firestoreGravar,
  turnstileAtivo,
  turnstileValidar,
} from "../_shared/firebase.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extra },
  });

const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

// ---------- AES-256-GCM ----------
let chaveCache: CryptoKey | null = null;
async function chave(): Promise<CryptoKey> {
  if (chaveCache) return chaveCache;
  const raw = Deno.env.get("CODE_ENC_KEY") ?? "";
  if (!raw) throw new Error("CODE_ENC_KEY ausente");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  chaveCache = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return chaveCache;
}
const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));

async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chave(), new TextEncoder().encode(texto));
  return `v1:${b64(iv)}:${b64(ct)}`;
}
async function decifrar(pacote: string): Promise<string> {
  const [, ivB64, ctB64] = pacote.split(":");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await chave(), ct);
  return new TextDecoder().decode(claro);
}

// ---------- código e sessão ----------
function novoCodigo(): string {
  const d = crypto.getRandomValues(new Uint8Array(12)).slice(0, 12);
  const n = Array.from(d, (x) => (x % 10).toString()).join("");
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}`;
}
const normaliza = (c: string) => String(c ?? "").replace(/\D/g, "");
function novoToken(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "").slice(0, 43);
}

async function contaPorToken(svc: ReturnType<typeof db>, token: string | null) {
  if (!token) return null;
  const { data } = await svc.from("acc_sessions").select("account_id, revoked").eq("token", token).maybeSingle();
  if (!data || data.revoked) return null;
  const { data: conta } = await svc.from("accounts").select("*").eq("id", data.account_id).maybeSingle();
  if (!conta || conta.blocked) return null;
  await svc.from("acc_sessions").update({ last_used: new Date().toISOString() }).eq("token", token);
  return conta;
}

const publico = (c: Record<string, unknown>) => ({
  id: c.id,
  tier: c.tier,
  recoveryEmail: c.recovery_email ?? null,
  codeHint: c.code_hint ?? null,
  createdAt: c.created_at,
});

// ---------- e-mail (fila + limite diário) ----------
const LIMITE_DIA_FREE = 5;

async function enviarEmail(
  svc: ReturnType<typeof db>,
  opts: { accountId?: string | null; to: string; subject: string; body: string; kind: string },
) {
  const inicioDia = new Date();
  inicioDia.setUTCHours(0, 0, 0, 0);
  const { count } = await svc
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .gte("created_at", inicioDia.toISOString());
  const usados = count ?? 0;
  const estourou = usados >= LIMITE_DIA_FREE;

  const { data: linha } = await svc.from("email_outbox").insert({
    account_id: opts.accountId ?? null,
    to_email: opts.to,
    subject: opts.subject,
    body: opts.body,
    kind: opts.kind,
    status: estourou ? "blocked_quota" : "queued",
  }).select("id").single();

  if (estourou) return { enviado: false, motivo: "limite diario (5/5) do plano free", id: linha?.id };

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { enviado: false, motivo: "RESEND_API_KEY ausente (fica na fila)", id: linha?.id };

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("MAIL_FROM") ?? "SKYNETchat <suporte@skynetchat.net>",
        to: [opts.to],
        subject: opts.subject,
        text: opts.body,
      }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados?.message ?? `HTTP ${r.status}`);
    await svc.from("email_outbox").update({
      status: "sent",
      provider_id: dados?.id ?? null,
      sent_at: new Date().toISOString(),
    }).eq("id", linha!.id);
    return { enviado: true, id: linha!.id };
  } catch (e) {
    await svc.from("email_outbox").update({ status: "failed", error: (e as Error).message }).eq("id", linha!.id);
    return { enviado: false, motivo: (e as Error).message, id: linha?.id };
  }
}

function corpoRecuperacao(codigo: string, email: string) {
  return [
    "Seu código de acesso ao SKYNETchat",
    "",
    codigo,
    "",
    `Use este código para entrar na conta ligada a ${email}.`,
    "Guarde com cuidado: quem tiver o código entra na conta.",
    "",
    "Se não foi você que pediu, ignore esta mensagem.",
    "",
    "SKYNETchat · E2E | AES-256 | ZERO-TRUST",
  ].join("\n");
}

// ---------- ações ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const acao = (url.searchParams.get("action") ?? "").trim();
  const svc = db();
  const token = req.headers.get("x-session");
  let corpo: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try {
      corpo = await req.json();
    } catch { /* corpo vazio é válido */ }
  }

  try {
    // ---- sessão atual ----
    if (acao === "session" && req.method === "GET") {
      const conta = await contaPorToken(svc, token);
      if (!conta) return json({ error: "unauthorized" }, 401);
      return json({ ok: true, user: publico(conta) });
    }

    // ---- sair ----
    if (acao === "logout") {
      if (token) await svc.from("acc_sessions").update({ revoked: true }).eq("token", token);
      return json({ ok: true });
    }

    // ---- cadastro: gera a conta e devolve o código uma única vez ----
    if (acao === "access-code") {
      const ipCliente = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
      const captcha = await turnstileValidar(String(corpo.turnstileToken ?? corpo.cfToken ?? ""), ipCliente);
      if (!captcha.ok) return json({ ok: false, error: "Verificação de segurança falhou. Recarregue e tente de novo." }, 403);

      const codigo = novoCodigo();
      const enc = await cifrar(normaliza(codigo));
      const { data: conta, error } = await svc.from("accounts").insert({
        code_enc: enc,
        code_hint: normaliza(codigo).slice(-4),
        tier: "free",
      }).select("*").single();
      if (error) return json({ error: error.message }, 500);

      const sess = novoToken();
      await svc.from("acc_sessions").insert({
        token: sess,
        account_id: conta.id,
        ua: (req.headers.get("user-agent") ?? "").slice(0, 200),
      });
      // espelho opcional no Firestore (silencioso se o Firebase não estiver configurado)
      await firestoreGravar("accounts", conta.id, {
        code_hint: normaliza(codigo).slice(-4),
        tier: String(conta.tier ?? "free"),
        created_at: String(conta.created_at ?? new Date().toISOString()),
        source: "skynetchat",
      });

      return json({
        ok: true,
        firestore: firestoreAtivo(),
        code: codigo,
        account: publico(conta),
        session: sess,
        termsAccepted: !!corpo.termsAccepted,
        ageConfirmed: !!corpo.ageConfirmed,
      });
    }

    // ---- login por código ----
    if (acao === "login") {
      const digitado = normaliza(String(corpo.code ?? ""));
      if (digitado.length !== 12) return json({ ok: false, error: "Código incompleto: são 12 dígitos." }, 400);

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
      await svc.from("auth_attempts").insert({ ip, code: digitado.slice(-4), ok: false }).then(() => {}, () => {});

      const { data: contas } = await svc.from("accounts").select("*").eq("blocked", false).limit(2000);
      let alvo: Record<string, unknown> | null = null;
      for (const c of contas ?? []) {
        try {
          if ((await decifrar(String(c.code_enc))) === digitado) { alvo = c; break; }
        } catch { /* pacote inválido, segue */ }
      }
      if (!alvo) return json({ ok: false, error: "Código não encontrado. Confira os 12 dígitos." }, 404);

      const sess = novoToken();
      await svc.from("acc_sessions").insert({
        token: sess,
        account_id: alvo.id,
        ua: (req.headers.get("user-agent") ?? "").slice(0, 200),
      });
      await svc.from("accounts").update({
        last_seen: new Date().toISOString(),
        visits: Number(alvo.visits ?? 0) + 1,
      }).eq("id", alvo.id);
      await firestoreGravar("accounts", String(alvo.id), {
        last_seen: new Date().toISOString(),
        tier: String(alvo.tier ?? "free"),
      });
      return json({ ok: true, user: publico(alvo), session: sess });
    }

    // ---- recuperação: pede o código por e-mail ----
    if (acao === "recovery-request") {
      const email = String(corpo.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
        return json({ ok: false, error: "Digite um e-mail válido." }, 400);
      }
      const { data: conta } = await svc.from("accounts")
        .select("*").ilike("recovery_email", email).limit(1).maybeSingle();

      // resposta neutra: não conta se o e-mail existe
      if (!conta) return json({ ok: true, aviso: "Se este e-mail estiver cadastrado, o código chega em instantes." });

      const codigo = await decifrar(String(conta.code_enc));
      const formatado = `${codigo.slice(0, 4)}-${codigo.slice(4, 8)}-${codigo.slice(8, 12)}`;
      const envio = await enviarEmail(svc, {
        accountId: conta.id,
        to: email,
        subject: "Seu código de acesso ao SKYNETchat",
        body: corpoRecuperacao(formatado, email),
        kind: "recovery",
      });
      return json({
        ok: true,
        aviso: "Se este e-mail estiver cadastrado, o código chega em instantes.",
        entrega: envio.enviado ? "enviado" : envio.motivo,
      });
    }

    // ---- salvar e-mail de recuperação (logado) ----
    if (acao === "recovery-email") {
      const conta = await contaPorToken(svc, token);
      if (!conta) return json({ ok: false, error: "Entre na conta primeiro." }, 401);
      const email = String(corpo.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
        return json({ ok: false, error: "E-mail inválido." }, 400);
      }
      await svc.from("accounts").update({
        recovery_email: email,
        recovery_email_verified: false,
        updated_at: new Date().toISOString(),
      }).eq("id", conta.id);
      return json({ ok: true });
    }

    // ---- novo código de segurança ----
    if (acao === "new-code") {
      const conta = await contaPorToken(svc, token);
      if (!conta) return json({ ok: false, error: "Entre na conta primeiro." }, 401);
      if (!conta.recovery_email) {
        return json({ ok: false, message: "Adicione um email de recuperação antes de gerar um novo código." }, 400);
      }
      const codigo = novoCodigo();
      await svc.from("accounts").update({
        code_enc: await cifrar(normaliza(codigo)),
        code_hint: normaliza(codigo).slice(-4),
        updated_at: new Date().toISOString(),
      }).eq("id", conta.id);
      await svc.from("acc_sessions").update({ revoked: true }).eq("account_id", conta.id);
      const envio = await enviarEmail(svc, {
        accountId: conta.id,
        to: conta.recovery_email,
        subject: "Novo código de acesso ao SKYNETchat",
        body: corpoRecuperacao(codigo, conta.recovery_email),
        kind: "new_code",
      });
      return json({
        ok: true,
        newCode: codigo,
        sentToEmail: envio.enviado ? conta.recovery_email : null,
        entrega: envio.enviado ? "enviado" : envio.motivo,
      });
    }

    // ---- suporte (abre pedido e avisa o e-mail de suporte) ----
    if (acao === "support") {
      const conta = await contaPorToken(svc, token);
      const email = String(corpo.email ?? conta?.recovery_email ?? "").trim().toLowerCase();
      const mensagem = String(corpo.message ?? corpo.mensagem ?? "").slice(0, 4000);
      if (!mensagem) return json({ ok: false, error: "Escreva sua mensagem." }, 400);
      const suporte = Deno.env.get("MAIL_SUPPORT") ?? "suporte@skynetchat.net";
      const envio = await enviarEmail(svc, {
        accountId: conta?.id ?? null,
        to: suporte,
        subject: `[suporte] ${email || "visitante"}`.slice(0, 120),
        body: `De: ${email || "visitante"}\nConta: ${conta?.id ?? "sem conta"}\n\n${mensagem}`,
        kind: "support",
      });
      return json({ ok: true, protocolo: envio.id ?? null, entrega: envio.enviado ? "enviado" : envio.motivo });
    }

    // ---- painel de saúde (monitoramento) ----
    if (acao === "health") {
      const dia = new Date();
      dia.setUTCHours(0, 0, 0, 0);
      const [{ count: contas }, { count: emails }, { count: fila }] = await Promise.all([
        svc.from("accounts").select("id", { count: "exact", head: true }),
        svc.from("email_outbox").select("id", { count: "exact", head: true }).gte("created_at", dia.toISOString()),
        svc.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "queued"),
      ]);
      return json({
        ok: true,
        contas: contas ?? 0,
        emails_hoje: emails ?? 0,
        limite_dia: LIMITE_DIA_FREE,
        na_fila: fila ?? 0,
        cifra: (Deno.env.get("CODE_ENC_KEY") ?? "") ? "AES-256-GCM" : "desligada",
        email_configurado: !!(Deno.env.get("RESEND_API_KEY") ?? ""),
        firestore: firestoreAtivo() ? "ligado" : "desligado",
        contas_firestore: await firestoreContar("accounts"),
        turnstile: turnstileAtivo() ? "ligado" : "desligado",
      });
    }

    return json({ ok: false, error: `Ação desconhecida: ${acao || "(vazia)"}.` }, 404);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
