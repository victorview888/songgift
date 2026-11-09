import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { checkoutQuote, getPaymentOrder, publicPrice } from "@/lib/services/checkout";

export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const order = await getPaymentOrder(typeof body.orderId === "string" ? body.orderId : "", user!.id);
    return NextResponse.json({ checkoutPrice: publicPrice(await checkoutQuote(order, user!)) });
  });
}
