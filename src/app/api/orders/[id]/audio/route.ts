import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";
import { getOwnedOrder } from "@/lib/supabase/orders";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authRoute(request, async ({ user }) => {
    const id = (await context.params).id;
    const order = await getOwnedOrder(id, user!.id);
    const { data, error } = await getSupabaseAdmin().from("song_assets").select("storage_bucket,storage_path,mime_type").eq("order_id", id).eq("is_final", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Could not find audio: " + error.message);
    if (!data) throw new HttpError(404, "Your song is not ready to download yet.");
    const download = new URL(request.url).searchParams.get("download") === "1";
    const name = (order.title || "Song for " + order.recipient_name).normalize("NFKD").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 90) || "SongGift";
    const extension = ({ "audio/wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac", "audio/mp4": "m4a" } as Record<string, string>)[data.mime_type] || "mp3";
    const signed = await getSupabaseAdmin().storage.from(data.storage_bucket).createSignedUrl(data.storage_path, 60, download ? { download: name + "." + extension } : undefined);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Could not create private audio link.");
    const response = NextResponse.redirect(signed.data.signedUrl, 302);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  });
}
