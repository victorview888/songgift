import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { checkOrderGeneration } from "@/lib/services/generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return authRoute(request, async ({ user }) => {
    const order = await getOwnedOrder(new URL(request.url).searchParams.get("orderId") || "", user!.id);
    return NextResponse.json(await checkOrderGeneration(order, (await context.params).jobId));
  });
}
