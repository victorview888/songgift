import { getHoliday } from "./holidays";

// Only these form values may come from a public occasion link. Story text,
// recipient details and existing drafts never come from query parameters.
const presets = [
  { slug: "birthday", name: "Birthday", occasion: "Birthday" },
  { slug: "wedding", name: "Wedding", occasion: "Wedding" },
  { slug: "anniversary", name: "Anniversary", occasion: "Anniversary" },
  { slug: "memorial", name: "In memory", occasion: "In memory" },
] as const;

export function getOccasionPreset(slug: string | null | undefined) {
  return presets.find(preset => preset.slug === slug) || getHoliday(slug);
}

export function occasionCreateHref(slug: string) {
  return getOccasionPreset(slug) ? `/create?occasion=${slug}` : "/create";
}
