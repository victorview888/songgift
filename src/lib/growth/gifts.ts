import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOwnedOrder, isOrderId } from "@/lib/supabase/orders";
import { HttpError } from "@/lib/http-error";
import { canonicalMime, MAX_AUDIO_BYTES } from "@/lib/supabase/song-assets";
export const giftHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cross-Origin-Resource-Policy": "same-origin",
};
export function assertGiftToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(404, "This gift link is unavailable.");
}
export async function ownedGift(id: string, user: string) {
  await getOwnedOrder(id, user);
  const { data, error } = await getSupabaseAdmin()
    .from("song_gifts")
    .select("active,token,greeting")
    .eq("order_id", id)
    .eq("owner_user_id", user)
    .maybeSingle();
  if (error)
    throw new HttpError(503, "Gift sharing is temporarily unavailable.");
  return {
    active: data?.active === true,
    url: data?.active ? "/gift/" + data.token : null,
    greeting: data?.greeting || "",
  };
}
export async function setGift(id: string, user: string, body: unknown) {
  if (!isOrderId(id)) throw new HttpError(404, "Song order not found.");
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Please check the sharing settings.");
  const input = body as Record<string, unknown>;
  if (
    typeof input.active !== "boolean" ||
    (input.active && input.confirmed !== true) ||
    typeof input.greeting !== "string" ||
    input.greeting.length > 300 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.greeting)
  )
    throw new HttpError(
      400,
      "Confirm permission to share and keep the greeting within 300 characters.",
    );
  const random = crypto.getRandomValues(new Uint8Array(32));
  const token = Buffer.from(random).toString("base64url");
  const { data, error } = await getSupabaseAdmin().rpc("set_songgift_gift", {
    p_order_id: id,
    p_user_id: user,
    p_active: input.active,
    p_token: token,
    p_greeting: input.greeting.trim(),
  });
  if (error || !data)
    throw new HttpError(
      error?.code === "P0002" ? 404 : error?.code === "22023" ? 409 : 503,
      error?.code === "22023"
        ? "Your song needs recorded payment and finished audio before sharing."
        : "Gift sharing is temporarily unavailable.",
    );
  return {
    active: data.active,
    url: data.active ? "/gift/" + data.token : null,
    greeting: data.greeting,
  };
}
export async function publicGift(token: string) {
  assertGiftToken(token);
  const db = getSupabaseAdmin();
  const link = await db
    .from("song_gifts")
    .select("order_id,owner_user_id,greeting")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();
  if (link.error)
    throw new HttpError(
      503,
      "This gift is temporarily unavailable. Please try again later.",
    );
  if (!link.data) throw new HttpError(404, "This gift link is unavailable.");
  const order = await db
    .from("song_orders")
    .select("id,user_id,title,recipient_name,paid_at")
    .eq("id", link.data.order_id)
    .maybeSingle();
  const asset = await db
    .from("song_assets")
    .select("id")
    .eq("order_id", link.data.order_id)
    .eq("is_final", true)
    .limit(1)
    .maybeSingle();
  if (order.error || asset.error)
    throw new HttpError(503, "This gift is temporarily unavailable.");
  if (
    !order.data?.user_id ||
    order.data.user_id !== link.data.owner_user_id ||
    !order.data.paid_at ||
    !asset.data
  )
    throw new HttpError(404, "This gift link is unavailable.");
  return {
    title: order.data.title || "A song for " + order.data.recipient_name,
    recipient: order.data.recipient_name,
    greeting: link.data.greeting,
  };
}
export async function giftAudio(token: string, range: string | null) {
  await publicGift(token);
  const db = getSupabaseAdmin();
  const link = await db
    .from("song_gifts")
    .select("order_id")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();
  if (link.error)
    throw new HttpError(503, "Gift audio is temporarily unavailable.");
  if (!link.data) throw new HttpError(404, "This gift link is unavailable.");
  const asset = await db
    .from("song_assets")
    .select("storage_bucket,storage_path,mime_type")
    .eq("order_id", link.data.order_id)
    .eq("is_final", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (asset.error)
    throw new HttpError(503, "Gift audio is temporarily unavailable.");
  if (!asset.data) throw new HttpError(404, "This gift link is unavailable.");
  const result = await db.storage
    .from(asset.data.storage_bucket)
    .download(asset.data.storage_path);
  if (
    result.error ||
    !result.data ||
    result.data.size === 0 ||
    result.data.size > MAX_AUDIO_BYTES
  )
    throw new HttpError(503, "Gift audio is temporarily unavailable.");
  // Recheck after downloading. A revoked link never receives a newly issued signed URL.
  const current = await db
    .from("song_gifts")
    .select("active")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();
  if (current.error)
    throw new HttpError(503, "Gift audio is temporarily unavailable.");
  if (!current.data) throw new HttpError(404, "This gift link is unavailable.");
  const blob = result.data,
    total = blob.size;
  const headers = new Headers({
    ...giftHeaders,
    "Content-Type": canonicalMime(asset.data.mime_type),
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
  });
  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = m ? Number(m[1]) : -1,
      end = m && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start >= total ||
      !Number.isSafeInteger(end) ||
      end < start
    ) {
      headers.set("Content-Range", "bytes */" + total);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(blob.slice(start, end + 1), { status: 206, headers });
  }
  headers.set("Content-Length", String(total));
  return new Response(blob, { headers });
}
