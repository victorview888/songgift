import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http-error";
import { uuid } from "@/lib/admin/workspace";
import {
  usageSources,
  usageMedia,
  usageEvents,
  usagePages,
  campaignAllowlist,
  usageOccasion,
  usageOccasions,
} from "./usage";
export function usageSession(request: Request) {
  const value =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("sg_usage="))
      ?.slice(9) || "";
  if (!uuid(value))
    throw new HttpError(400, "Usage consent session is missing.");
  return value;
}
export async function saveUsage(
  request: Request,
  input: Record<string, unknown>,
  order?: { id: string; userId: string; occasion?: string },
) {
  const sid = usageSession(request);
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "eventKey",
          "event",
          "page",
          "first",
          "last",
          "medium",
          "campaign",
          "occasion",
        ].includes(k),
    ) ||
    typeof input.eventKey !== "string" ||
    !uuid(input.eventKey) ||
    !usageEvents.includes(input.event as never) ||
    !usagePages.includes(input.page as never) ||
    !usageSources.includes(input.first as never) ||
    !usageSources.includes(input.last as never) ||
    !usageMedia.includes(input.medium as never) ||
    typeof input.campaign !== "string" ||
    (input.occasion !== undefined && input.occasion !== null && !usageOccasions.includes(input.occasion as never)) ||
    (input.event === "sample_played" && !["home", "occasions"].includes(String(input.page))) ||
    (input.event === "story_started" && input.page !== "create") ||
    (input.event === "preview_played" && (!order || input.page !== "lyrics"))
  )
    throw new HttpError(400, "Invalid usage event.");
  const campaign = campaignAllowlist(
    process.env.SONGGIFT_ANALYTICS_CAMPAIGNS || "",
  ).includes(input.campaign)
    ? input.campaign
    : "";
  const { data, error } = await getSupabaseAdmin().rpc(
    "record_songgift_usage",
    {
      p_session: sid,
      p_key: input.eventKey,
      p_event: input.event,
      p_page: input.page,
      p_first: input.first,
      p_last: input.last,
      p_medium: input.medium,
      p_campaign: campaign,
      p_occasion: order ? usageOccasion(order.occasion) : input.occasion ?? null,
      p_order_id: order?.id ?? null,
      p_user_id: order?.userId ?? null,
    },
  );
  if (error)
    throw new HttpError(503, "Usage statistics are temporarily unavailable.");
  if (data === false) throw new HttpError(429, "Usage event limit reached.");
  return { ok: true };
}
export async function forgetUsage(request: Request) {
  const sid = usageSession(request);
  const { error } = await getSupabaseAdmin().rpc("forget_songgift_usage", {
    p_session: sid,
  });
  if (error) throw new HttpError(503, "Please retry removing usage data.");
  return { ok: true };
}
