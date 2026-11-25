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
  "sample_played",
  "story_started",
  "story_submitted",
  "lyrics_ready",
  "preview_played",
  "checkout_started",
] as const;
export type UsageEvent = (typeof usageEvents)[number];
export const usageOccasionLabels = {
  birthday: "生日",
  wedding: "婚礼",
  anniversary: "纪念日",
  family: "家庭",
  pet: "宠物",
  memorial: "纪念逝者",
  christmas: "圣诞节",
  "christmas-eve": "平安夜",
  "new-year": "新年",
  "just-because": "日常赠礼",
  "thank-you": "感谢",
} as const;
export type UsageOccasion = keyof typeof usageOccasionLabels;
export const usageOccasions = Object.keys(usageOccasionLabels) as UsageOccasion[];
export function usageOccasion(value: unknown): UsageOccasion | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  const key = normalized === "in-memory" ? "memorial" : normalized;
  return usageOccasions.includes(key as UsageOccasion) ? key as UsageOccasion : null;
}
export const usageEventLabels: Record<UsageEvent, string> = {
  page_view: "页面浏览",
  sample_played: "公开样曲播放",
  story_started: "开始填写（首次编辑）",
  story_submitted: "故事提交成功",
  lyrics_ready: "歌词已就绪",
  preview_played: "个人预览播放",
  checkout_started: "开始付款",
};
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
