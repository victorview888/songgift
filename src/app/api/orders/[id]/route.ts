import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { songPriceUsdForEmail } from "@/lib/pricing";
import { getOwnedOrder, saveApprovedLyrics } from "@/lib/supabase/orders";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authRoute(request, async ({ user }) => NextResponse.json({
    order: await getOwnedOrder((await context.params).id, user!.id),
    checkoutPrice: { currencyCode: process.env.PAYPAL_CURRENCY || "USD", value: songPriceUsdForEmail(user!.email) },
  }));
}
export async function PATCH(request: Request, context: Context) {
  return authRoute(request, async ({ user }) => {
    const { lyricsText } = await request.json();
    const id = (await context.params).id;
    await saveApprovedLyrics(id, user!.id, typeof lyricsText === "string" ? lyricsText : "");
    return NextResponse.json({ ok: true });
  });
}
