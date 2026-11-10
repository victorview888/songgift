import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { checkoutQuote, getPaymentOrder } from "@/lib/services/checkout";
import { openWaffoCheckout } from "@/lib/payments/waffo";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const order = await getPaymentOrder(orderId, user!.id);
    if (order.paid_at) return NextResponse.json({ alreadyPaid: true, orderId });
    await checkoutQuote(order, user!);
    return NextResponse.json(await openWaffoCheckout(orderId, user!.id, user!.email!, new URL(request.url).origin));
  });
}
