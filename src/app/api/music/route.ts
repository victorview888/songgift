import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { startOrderGeneration } from "@/lib/services/generation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const order = await getOwnedOrder(typeof body.orderId === "string" ? body.orderId : "", user!.id);
    return NextResponse.json(await startOrderGeneration(order, user!.id));
  });
}
