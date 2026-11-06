import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { createPayPalOrder, capturePayPalOrder } from "@/lib/paypal";
import { bindCheckout } from "@/lib/services/order-operations";
import { checkoutQuote, getPaymentOrder, publicPrice } from "@/lib/services/checkout";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const order = await getPaymentOrder(orderId, user!.id);
    if (order.paid_at) return NextResponse.json({ alreadyPaid: true, orderId });
    const quote = await checkoutQuote(order, user!);
    const returnUrl = new URL("/lyrics/" + orderId, request.url).toString();
    const result = await createPayPalOrder(quote, { returnUrl, cancelUrl: returnUrl }, order.paypal_order_id);
    await bindCheckout(orderId, user!.id, result.id);
    if (result.completed) {
      await capturePayPalOrder(result.id, { userId: user!.id, quote });
      return NextResponse.json({ alreadyPaid: true, orderId, checkoutPrice: publicPrice(quote) });
    }
    return NextResponse.json({ ...result, checkoutPrice: publicPrice(quote) });
  });
}
