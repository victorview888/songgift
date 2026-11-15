export const holidayOccasions = [
  {
    slug: "christmas-eve",
    name: "Christmas Eve",
    occasion: "Christmas Eve",
    month: 12,
    day: 24,
    description: "A quiet song for the traditions, late-night conversations and people who make the evening yours.",
    storyHint: "Think of an evening tradition, who you share it with, and one thing you want them to hear.",
    storyPlaceholder: "Who is this Christmas Eve song for? Describe a small tradition, a familiar sound or a memory from your evenings together. Say whether you want a festive, reflective or non-religious message...",
  },
  {
    slug: "christmas",
    name: "Christmas",
    occasion: "Christmas",
    month: 12,
    day: 25,
    description: "Turn a family memory, an inside joke or a thank-you into a gift they can press play on.",
    storyHint: "Share a Christmas memory, a little habit you love, and the message you want to give this year.",
    storyPlaceholder: "Who are you giving this song to? Tell us about a Christmas memory or tradition, what makes them special, and what you want to say. Include only the beliefs and seasonal details that fit your story...",
  },
  {
    slug: "new-year",
    name: "New Year's Day",
    occasion: "New Year",
    month: 1,
    day: 1,
    description: "Celebrate what you came through together and the small hopes you want to carry into a new year.",
    storyHint: "Choose a moment from the year, someone you want to thank, and a hope for the year ahead.",
    storyPlaceholder: "Who is this New Year song for? Describe one moment you shared this year, what you appreciate about them, and a hope for the next chapter. Mention any year or date you want in the lyrics...",
  },
] as const;

export function getHoliday(slug: string | null | undefined) {
  return holidayOccasions.find(holiday => holiday.slug === slug);
}

export function holidayForOccasion(occasion: string) {
  return holidayOccasions.find(holiday => holiday.occasion === occasion);
}

export function holidayCreateHref(slug: string) {
  return getHoliday(slug) ? `/create?occasion=${slug}` : "/create";
}

// Evergreen guides and form options remain available all year. Only the home
// feature is seasonal; completed holidays disappear and years advance naturally.
export function featuredHolidays(now = new Date()) {
  if (!Number.isFinite(now.getTime())) return [];
  const month = now.getUTCMonth();
  if (month !== 0 && month < 10) return [];
  const seasonYear = now.getUTCFullYear() - (month === 0 ? 1 : 0);
  const today = Date.UTC(now.getUTCFullYear(), month, now.getUTCDate());
  return holidayOccasions.flatMap(holiday => {
    const year = seasonYear + (holiday.month === 1 ? 1 : 0);
    const date = new Date(Date.UTC(year, holiday.month - 1, holiday.day));
    if (date.getTime() < today) return [];
    return [{ ...holiday, date: date.toISOString().slice(0, 10), dateLabel: new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date) }];
  });
}
