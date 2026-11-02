import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { orderColumns } from "@/lib/supabase/orders";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return authRoute(request, async ({ supabase, user }) => {
    const page = Math.max(0, Number.parseInt(new URL(request.url).searchParams.get("page") || "0", 10) || 0);
    const pageSize = 20;
    let query = supabase.from("song_orders").select(orderColumns, { count: "exact" }).eq("user_id", user!.id).order("created_at", { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    const filter = new URL(request.url).searchParams.get("filter");
    if (filter === "ready") query = query.eq("status", "completed");
    if (filter === "progress") query = query.eq("status", "generating");
    if (filter === "draft") query = query.in("status", ["draft", "lyrics_ready", "paid"]);
    const { data, error, count } = await query;
    if (error) throw new Error("Could not list orders: " + error.message);
    return NextResponse.json({ orders: data || [], total: count || 0, page, pageSize });
  });
}
