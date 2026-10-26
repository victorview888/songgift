import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/lib/paypal";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { orderId?: unknown };
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) return NextResponse.json({ error: "A SongGift order is required." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("song_orders").select("id,status").eq("id", orderId).maybeSingle();
    if (error) throw new Error("Could not verify the song order: " + error.message);
    if (!data) return NextResponse.json({ error: "Song order not found." }, { status: 404 });
    if (data.status === "paid" || data.status === "generating" || data.status === "completed") {
      return NextResponse.json({ alreadyPaid: true, orderId });
    }
    const origin = new URL(request.url).origin;
    return NextResponse.json(await createPayPalOrder(orderId, {
      returnUrl: process.env.PAYPAL_RETURN_URL || origin + "/lyrics/demo",
      cancelUrl: process.env.PAYPAL_CANCEL_URL || origin + "/lyrics/demo",
    }));
  } catch (error) {
    const status = error instanceof Error && error.name === "ProviderConfigurationError" ? 503 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "PayPal checkout could not start." }, { status });
  }
}
