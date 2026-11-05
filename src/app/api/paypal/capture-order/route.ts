import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";
import { capturePayPalOrder } from "@/lib/paypal";
import { songPriceUsdForEmail } from "@/lib/pricing";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await request.json();
    const paypalOrderId = typeof body.paypalOrderId === "string" ? body.paypalOrderId.trim() : "";
    if (!paypalOrderId) throw new HttpError(400, "A PayPal order is required.");
    const { data, error } = await getSupabaseAdmin().from("song_orders").select("id").eq("paypal_order_id", paypalOrderId).eq("user_id", user!.id).maybeSingle();
    if (error) throw new Error("Could not verify owned checkout: " + error.message);
    if (!data) throw new HttpError(404, "Payment order not found.");
    return NextResponse.json(await capturePayPalOrder(paypalOrderId, { orderId: data.id, userId: user!.id, priceUsd: songPriceUsdForEmail(user!.email) }));
  });
}
