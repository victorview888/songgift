import { authRoute, HttpError } from "@/lib/auth/server";
import { smallJson } from "@/lib/growth/body";
import { saveUsage } from "@/lib/growth/usage-server";
import { getOwnedOrder } from "@/lib/supabase/orders";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return authRoute(request, async ({ user }) => {
    const body = await smallJson(request);
    const { orderId, ...event } = body;
    if (
      typeof orderId !== "string" ||
      !["story_submitted", "lyrics_ready", "checkout_started"].includes(
        String(event.event),
      )
    )
      throw new HttpError(400, "Invalid order event.");
    await getOwnedOrder(orderId, user!.id);
    await saveUsage(request, event, { id: orderId, userId: user!.id });
    return Response.json({ ok: true });
  });
}
