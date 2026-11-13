import { usagePage, usageSources, usageMedia } from "./usage";

const CONTEXT_KEY = "sg_usage_context";
const CHOICE_KEY = "sg_usage_choice";
type Context = {
  id: string;
  first: string;
  last: string;
  medium: string;
  campaign: string;
  expires: number;
};

export function getChoice() {
  try {
    return localStorage.getItem(CHOICE_KEY) || "";
  } catch {
    return "deny";
  }
}
function privateSignal() {
  return (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}
export function stopUsage() {
  localStorage.setItem(CHOICE_KEY, "deny");
  window.dispatchEvent(new Event("songgift:consent"));
}
export function hasUsageSession() {
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith("sg_usage="));
}
export function setUsageChoice(allow: boolean, campaigns: string[]) {
  const choice = allow && !privateSignal() ? "allow" : "deny";
  if (choice === "allow" && getChoice() !== "allow")
    localStorage.removeItem(CONTEXT_KEY);
  localStorage.setItem(CHOICE_KEY, choice);
  if (choice === "allow") refreshContext(campaigns);
  else {
    localStorage.removeItem(CONTEXT_KEY);
    document.cookie = "sg_usage=; Path=/; Max-Age=0; SameSite=Lax";
  }
  window.dispatchEvent(new Event("songgift:consent"));
}
function validContext(value: Context | null, now: number): value is Context {
  return (
    !!value &&
    typeof value.id === "string" &&
    /^[a-f0-9-]{36}$/i.test(value.id) &&
    usageSources.includes(value.first as never) &&
    usageSources.includes(value.last as never) &&
    usageMedia.includes(value.medium as never) &&
    typeof value.campaign === "string" &&
    Number.isFinite(value.expires) &&
    value.expires > now &&
    value.expires <= now + 30 * 86400000
  );
}
export function refreshContext(campaigns: string[]) {
  try {
    if (getChoice() !== "allow" || privateSignal()) return;
    const now = Date.now();
    let previous: Context | null = null;
    try {
      previous = JSON.parse(localStorage.getItem(CONTEXT_KEY) || "null");
    } catch {
      /* Start a fresh context. */
    }
    const isNew = !validContext(previous, now);
    const current: Context =
      !isNew && previous
        ? previous
        : {
            id: crypto.randomUUID(),
            first: "direct",
            last: "direct",
            medium: "none",
            campaign: "",
            expires: now + 30 * 86400000,
          };
    const url = new URL(window.location.href);
    let source = url.searchParams.get("utm_source") || "";
    if (!usageSources.includes(source as never)) {
      source = "";
      if (document.referrer) {
        try {
          const host = new URL(document.referrer).hostname;
          if (host !== location.hostname) {
            source = /^(www\.)?google\./.test(host)
              ? "google"
              : /^(www\.)?bing\.com$/.test(host)
                ? "bing"
                : /(^|\.)instagram\.com$/.test(host)
                  ? "instagram"
                  : /(^|\.)facebook\.com$/.test(host)
                    ? "facebook"
                    : "referral";
          }
        } catch {
          /* Never store the raw referrer. */
        }
      }
    }
    if (source) {
      if (isNew) current.first = source;
      current.last = source;
      const medium =
        url.searchParams.get("utm_medium") ||
        (["google", "bing"].includes(source) ? "organic" : "referral");
      current.medium = usageMedia.includes(medium as never)
        ? medium
        : "referral";
      const campaign = url.searchParams.get("utm_campaign") || "";
      current.campaign = campaigns.includes(campaign) ? campaign : "";
    }
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(current));
    document.cookie =
      "sg_usage=" +
      current.id +
      "; Path=/; SameSite=Lax; Max-Age=" +
      Math.floor((current.expires - now) / 1000) +
      (location.protocol === "https:" ? "; Secure" : "");
  } catch {
    /* Unavailable browser storage must not break the customer flow. */
  }
}
export async function trackUsage(
  event: "page_view" | "story_submitted" | "lyrics_ready" | "checkout_started",
  orderId?: string,
) {
  try {
    if (getChoice() !== "allow" || privateSignal()) return;
    const value = JSON.parse(localStorage.getItem(CONTEXT_KEY) || "null");
    if (!validContext(value, Date.now())) return;
    const page = orderId ? "lyrics" : usagePage(location.pathname);
    if (!page) return;
    await fetch(orderId ? "/api/analytics/order" : "/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventKey: crypto.randomUUID(),
        event,
        page,
        first: value.first,
        last: value.last,
        medium: value.medium,
        campaign: value.campaign,
        ...(orderId ? { orderId } : {}),
      }),
      keepalive: true,
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* Optional analytics never blocks lyrics, payment or delivery. */
  }
}
export async function withdrawUsage() {
  const response = await fetch("/api/analytics/events", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(
      "Collection has stopped. Could not remove stored usage data; please retry.",
    );
}
