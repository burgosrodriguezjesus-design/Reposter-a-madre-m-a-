import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token.length > 64) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const saved = await db.abandonedCart.findUnique({ where: { token } });
  if (!saved) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  let lines: unknown = [];
  try {
    lines = JSON.parse(saved.cart);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ lines }, { headers: { "Cache-Control": "private, no-store" } });
}
