import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { HttpError } from "@/lib/auth/server";
import { issueAdminAudioLink } from "@/lib/admin/audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  return adminRoute(request, async ({ admin }) => {
    const params = new URL(request.url).searchParams;
    const mode = params.get("download");
    if (params.getAll("download").length > 1 || (mode !== null && mode !== "0" && mode !== "1")) throw new HttpError(400, "音频访问参数无效。");
    const { id, assetId } = await context.params;
    const url = await issueAdminAudioLink({ orderId: id, assetId, download: mode === "1", admin });
    const response = NextResponse.redirect(url, 302);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  });
}
