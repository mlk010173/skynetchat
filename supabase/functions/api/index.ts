// API pública do SKYNET — JSON simples, autenticada por chave "sk-...".
// GET  /api                → índice
// GET  /api/me             → conta, cota e chave usada
// GET  /api/models         → modelos disponíveis e saúde
// POST /api/chat           → { message | messages, model?, conversation? } → resposta completa
// GET  /api/conversations  → histórico
// GET  /api/conversations?id=X → mensagens
import { autorizar, json, registrar, contadorDeChamadas } from "../_shared/apikey.ts";
import { liberar, respostaLimite } from "../_shared/limite.ts";
import { svc } from "../_shared/sessao.ts";
import { perguntar } from "../_shared/chat.ts";

const t0 = () => performance.now();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const inicio = t0();
  const caminho = new URL(req.url).pathname.replace(/^\/api\/?/, "/");
  const autor = await autorizar(req);

  if (!autor) {
    await registrar(null, caminho, 401, Math.round(t0() - inicio));
    return json({
      ok: false,
      error: "Chave ausente ou inválida. Envie 'Authorization: Bearer sk-...'.",
      onde_pegar: "GET /functions/v1/auth?action=apikey-new (com x-session da conta)",
    }, 401);
  }

  await contadorDeChamadas(autor.keyId);
  if (!(await liberar("api:" + autor.keyId, 60, "minute"))) return respostaLimite();
  const db = svc();

  if (caminho === "/" || caminho === "") {
    return json({
      ok: true,
      nome: "SKYNET API",
      versao: "1.0",
      rotas: {
        "GET /api/me": "conta, cota e identificação da chave",
        "GET /api/models": "modelos disponíveis e saúde",
        "POST /api/chat": "conversa (message ou messages, model opcional, conversation opcional)",
        "GET /api/conversations": "histórico de conversas",
        "GET /api/conversations?id=X": "mensagens de uma conversa",
      },
      mcp: "/functions/v1/mcp (JSON-RPC 2.0)",
      status: "/functions/v1/status",
    });
  }

  if (caminho === "/me") {
    const { data } = await db
      .from("accounts")
      .select("id, tier, role, nickname, recovery_email, created_at")
      .eq("id", autor.accountId)
      .maybeSingle();
    const { count } = await db
      .from("api_log")
      .select("id", { count: "exact", head: true })
      .eq("account_id", autor.accountId);
    return json({ ok: true, conta: data, via: autor.via, chamadas_registradas: count ?? 0 });
  }

  if (caminho === "/models" && req.method === "GET") {
    const { data: saude } = await db
      .from("model_health")
      .select("model, ok, latency_ms, checked_at")
      .order("checked_at", { ascending: false })
      .limit(200);
    return json({ ok: true, saude: saude ?? [] });
  }

  if (caminho === "/chat" && req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    if (!body) return json({ ok: false, error: "JSON inválido." }, 400);
    let texto = "";
    if (typeof body.message === "string") texto = body.message;
    else if (Array.isArray(body.messages)) {
      const ultimo = [...body.messages].reverse().find((m: any) => m && m.role === "user");
      texto = typeof ultimo?.content === "string" ? ultimo.content : "";
    }
    texto = texto.trim();
    if (!texto) return json({ ok: false, error: "Envie 'message' ou 'messages' com um papel 'user'." }, 400);
    if (texto.length > 4000) return json({ ok: false, error: "Mensagem longa demais (máx. 4000)." }, 400);
    try {
      const saida = await perguntar(texto, typeof body.model === "string" && body.model ? body.model : "auto",
        typeof body.conversation === "string" && body.conversation ? body.conversation : null);
      await registrar(autor, caminho, 200, Math.round(t0() - inicio));
      return json({ ok: true, ...saida });
    } catch (e) {
      await registrar(autor, caminho, 502, Math.round(t0() - inicio));
      return json({ ok: false, error: (e as Error).message }, 502);
    }
  }

  if (caminho === "/conversations") {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const { data: conv } = await db
        .from("conversations").select("id, title, updated_at")
        .eq("id", id).eq("account_id", autor.accountId).maybeSingle();
      if (!conv) return json({ ok: false, error: "Conversa não encontrada." }, 404);
      const { data: mensagens } = await db
        .from("messages").select("role, content, created_at")
        .eq("conversation_id", id).order("created_at", { ascending: true }).limit(500);
      return json({ ok: true, conversa: conv, mensagens: mensagens ?? [] });
    }
    const { data } = await db
      .from("conversations").select("id, title, updated_at")
      .eq("account_id", autor.accountId).order("updated_at", { ascending: false }).limit(100);
    return json({ ok: true, conversas: data ?? [] });
  }

  await registrar(autor, caminho, 404, Math.round(t0() - inicio));
  return json({ ok: false, error: "Rota não encontrada." }, 404);
});
