import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readPreviewBytes, type AudioPreview } from "@/lib/services/audio-preview";
import { audioResponse } from "@/lib/audio/response";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!["birthday-demo", "anniversary-demo", "christmas-demo"].includes(slug)) return new Response(null, { status: 404 });
  try {
    const { data, error } = await getSupabaseAdmin().from("audio_previews").select("*").eq("kind", "sample").eq("public_slug", slug).eq("state", "ready").eq("is_public", true).maybeSingle();
    if (error || !data) return new Response(null, { status: 404 });
    return audioResponse(await readPreviewBytes(data as AudioPreview), data.mime_type, request.headers.get("range"), true);
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
