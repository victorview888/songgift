import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";
import { capturePayPalOrder } from "@/lib/paypal";
import { getPaymentOrder, storedQuote } from "@/lib/services/checkout";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const paypalOrderId = typeof body.paypalOrderId === "string" ? body.paypalOrderId.trim() : "";
    if (!paypalOrderId) throw new HttpError(400, "A PayPal order is required.");
    const order = await getPaymentOrder(paypalOrderId, user!.id, true);
    return NextResponse.json(await capturePayPalOrder(paypalOrderId, { userId: user!.id, quote: storedQuote(order) }));
  });
}
