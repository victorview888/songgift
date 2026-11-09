import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { waffoPaymentStatus } from "@/lib/payments/waffo";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return authRoute(request, async ({ user }) => {
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await waffoPaymentStatus(params.get("orderId") || "", user!.id, params.get("checkout") || ""));
  });
}
