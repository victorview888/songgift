import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";
import { createPayPalOrder } from "@/lib/paypal";
import { songPriceUsdForEmail } from "@/lib/pricing";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOwnedOrder } from "@/lib/supabase/orders";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const order = await getOwnedOrder(orderId, user!.id);
    if (order.paid_at) return NextResponse.json({ alreadyPaid: true, orderId });
    if (!order.lyrics_text) throw new HttpError(400, "Please review your lyrics before checkout.");
    const returnUrl = new URL("/lyrics/" + orderId, request.url).toString();
    const result = await createPayPalOrder(orderId, songPriceUsdForEmail(user!.email), { returnUrl, cancelUrl: returnUrl });
    const saved = await getSupabaseAdmin().from("song_orders").update({ paypal_order_id: result.id, updated_at: new Date().toISOString() }).eq("id", orderId).eq("user_id", user!.id).is("paid_at", null).select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("Could not associate checkout with owned order.");
    return NextResponse.json(result);
  });
}
