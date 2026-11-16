import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { previewSummary, startAudioPreview } from "@/lib/services/audio-preview";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authRoute(request, async ({ user }) => {
    const order = await getOwnedOrder((await context.params).id, user!.id);
    return NextResponse.json(await previewSummary(order, user!.id));
  });
}
export async function POST(request: Request, context: Context) {
  return authRoute(request, async ({ user }) => {
    const order = await getOwnedOrder((await context.params).id, user!.id);
    await startAudioPreview(order, user!.id);
    return NextResponse.json(await previewSummary(order, user!.id, false));
  });
}
