import { authRoute, HttpError } from "@/lib/auth/server";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { findOrderPreview, readPreviewBytes } from "@/lib/services/audio-preview";
import { audioResponse } from "@/lib/audio/response";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authRoute(request, async ({ user }) => {
    const order = await getOwnedOrder((await context.params).id, user!.id);
    const preview = await findOrderPreview(order.id, user!.id);
    if (!preview) throw new HttpError(404, "Audio preview not found.");
    return audioResponse(await readPreviewBytes(preview), preview.mime_type!, request.headers.get("range"));
  });
}
