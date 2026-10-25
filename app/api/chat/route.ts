import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/supabase-admin";
import { chatCompletion, ChatTurn } from "@/lib/ai";
import { isValidModel } from "@/lib/models";
import { anonymousAllowed, getClientIp } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_MESSAGE_CHARS = 4000;
const MAX_CONTEXT_MESSAGES = 30;

export async function POST(req: Request) {
  let body: { conversationId?: string; content?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const content = (body.content ?? "").trim();
  const model = body.model ?? "";

  if (!content) {
    return NextResponse.json({ ok: false, error: "Mensagem vazia." }, { status: 400 });
  }
  if (content.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { ok: false, error: `Mensagem muito longa (máx. ${MAX_MESSAGE_CHARS} caracteres).` },
      { status: 400 }
    );
  }
  if (!isValidModel(model)) {
    return NextResponse.json({ ok: false, error: "Modelo inválido." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const userId = admin ? await getUserIdFromRequest(req) : null;

  // Modo anônimo: sem login, sem persistência, com limite por IP.
  if (!userId) {
    if (!anonymousAllowed(getClientIp(req))) {
      return NextResponse.json(
        { ok: false, error: "Limite anônimo atingido (20 mensagens/hora). Crie uma conta para continuar." },
        { status: 429 }
      );
    }
    try {
      const reply = await chatCompletion(model, [{ role: "user", content }]);
      return NextResponse.json({ ok: true, conversationId: null, reply });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido.";
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
  }

  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servidor sem Supabase configurado." }, { status: 500 });
  }

  // Conversa: usa a informada (verificando dono) ou cria nova.
  let conversationId = body.conversationId ?? null;
  let title = content.slice(0, 60);

  if (conversationId) {
    const { data: conv, error } = await admin
      .from("conversations")
      .select("id, title")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !conv) {
      return NextResponse.json({ ok: false, error: "Conversa não encontrada." }, { status: 404 });
    }
    title = conv.title;
  } else {
    const { data: created, error } = await admin
      .from("conversations")
      .insert({ user_id: userId, title, model })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ ok: false, error: "Falha ao criar conversa." }, { status: 500 });
    }
    conversationId = created.id;
  }

  const { error: insertUserError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content,
  });
  if (insertUserError) {
    return NextResponse.json({ ok: false, error: "Falha ao salvar mensagem." }, { status: 500 });
  }

  // Histórico recente como contexto
  const { data: history } = await admin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_CONTEXT_MESSAGES);

  const turns: ChatTurn[] = (history ?? [])
    .slice()
    .reverse()
    .map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  let reply: string;
  try {
    reply = await chatCompletion(model, turns);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ ok: false, error: msg, conversationId }, { status: 502 });
  }

  const { error: insertAiError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
    model,
  });
  if (insertAiError) {
    return NextResponse.json({ ok: false, error: "Falha ao salvar resposta." }, { status: 500 });
  }

  await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  return NextResponse.json({ ok: true, conversationId, reply, title });
}
