import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { getPaymentOrder, publicPrice, storedQuote } from "@/lib/services/checkout";
import { getOwnedOrder, saveApprovedLyrics } from "@/lib/supabase/orders";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authRoute(request, async ({ user }) => {
    const id = (await context.params).id;
    const order = await getOwnedOrder(id, user!.id);
    const payment = await getPaymentOrder(id, user!.id);
    return NextResponse.json({ order, checkoutPrice: payment.quoted_at ? publicPrice(storedQuote(payment)) : null });
  });
}
export async function PATCH(request: Request, context: Context) {
  return authRoute(request, async ({ user }) => {
    const { lyricsText } = await request.json();
    const id = (await context.params).id;
    await saveApprovedLyrics(id, user!.id, typeof lyricsText === "string" ? lyricsText : "");
    return NextResponse.json({ ok: true });
  });
}
