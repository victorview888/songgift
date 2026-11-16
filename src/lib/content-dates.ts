import { guides } from "./guides";

// Editorial dates, changed only when the visible content/flow changes.
// Never use request/build time to make unchanged pages appear freshly edited.
const modified = new Map<string, string>([
  ["/", "2026-11-16"],
  ["/guides", "2026-11-16"],
  ["/create", "2026-11-16"],
  ["/pricing", "2026-11-16"],
  ["/help", "2026-11-16"],
  ["/occasions/wedding", "2026-11-16"],
  ["/occasions/birthday", "2026-11-16"],
  ["/occasions/anniversary", "2026-11-16"],
  ["/occasions/memorial", "2026-11-16"],
  ["/policies/terms", "2026-11-16"],
  ["/policies/privacy", "2026-11-16"],
  ...guides.map(guide => [`/guides/${guide.slug}`, guide.updatedOn || guide.publishedOn] as [string, string]),
]);

export const contentModifiedOn = (path: string) => modified.get(path);
export const formatContentDate = (date: string) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
}).format(new Date(date + "T00:00:00Z"));
