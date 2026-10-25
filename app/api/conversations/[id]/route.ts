import { NextResponse } from "next/server";
import { getSupabaseAdmin, getUserIdFromRequest } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Mensagens de uma conversa do usuário. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Servidor sem Supabase." }, { status: 500 });

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ ok: false, error: "Conversa não encontrada." }, { status: 404 });

  const { data, error } = await admin
    .from("messages")
    .select("id, role, content, model, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, messages: data ?? [] });
}

/** Deleta uma conversa (cascade apaga as mensagens). */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Servidor sem Supabase." }, { status: 500 });

  const { error } = await admin
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Renomeia uma conversa. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Servidor sem Supabase." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const title = (body.title ?? "").trim().slice(0, 80);
  if (!title) return NextResponse.json({ ok: false, error: "Título vazio." }, { status: 400 });

  const { error } = await admin
    .from("conversations")
    .update({ title })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
