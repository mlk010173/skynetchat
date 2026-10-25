import { NextResponse } from "next/server";
import { getModels } from "@/lib/models";

/** Lista de modelos disponível para o seletor do frontend. */
export async function GET() {
  return NextResponse.json({ ok: true, models: getModels() });
}
