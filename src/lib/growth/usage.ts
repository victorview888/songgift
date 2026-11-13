export const usageSources = [
  "direct",
  "google",
  "bing",
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "newsletter",
  "referral",
] as const;
export const usageMedia = [
  "none",
  "organic",
  "social",
  "email",
  "cpc",
  "referral",
] as const;
export const usageEvents = [
  "page_view",
  "story_submitted",
  "lyrics_ready",
  "checkout_started",
] as const;
export const usagePages = [
  "home",
  "create",
  "pricing",
  "occasions",
  "guide",
  "help",
  "lyrics",
] as const;
export function usagePage(path: string) {
  return path === "/"
    ? "home"
    : path === "/create"
      ? "create"
      : path === "/pricing"
        ? "pricing"
        : path === "/help"
          ? "help"
          : path === "/occasions" || path.startsWith("/occasions/")
            ? "occasions"
            : path === "/guides" || path.startsWith("/guides/")
              ? "guide"
              : null;
}
export function campaignAllowlist(raw: string) {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^[a-z0-9_-]{1,48}$/.test(v))
    .slice(0, 50);
}
