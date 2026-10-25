import { NextResponse } from "next/server";
import { getSupabaseAdmin, getUserIdFromRequest } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/** Lista as conversas do usuário logado. */
export async function GET(req: Request) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Servidor sem Supabase." }, { status: 500 });

  const { data, error } = await admin
    .from("conversations")
    .select("id, title, model, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, conversations: data ?? [] });
}
