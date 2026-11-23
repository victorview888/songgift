// Original illustrative scenes, independent of customer orders and public audio.
export const giftingScenes = {
  "home-hero-bright": { alt: "Illustrative AI scene of a woman enjoying a personalized song through headphones beside her partner", position: "74% 0%", height: 810, widths: [480, 960, 1440, 1672] },
  "home-hero": { alt: "Illustrative AI scene of a woman enjoying a personalized song through headphones beside her partner", position: "74% 0%", height: 810 },
  anniversary: { alt: "Illustrative AI scene of two partners sharing a song at home", position: "74% 42%" },
  birthday: { alt: "Illustrative AI scene of friends sharing a birthday celebration", position: "50% 45%" },
  wedding: { alt: "Illustrative AI scene of newlyweds dancing in a sunlit garden", position: "50% 45%" },
  family: { alt: "Illustrative AI scene of a family looking through a photo album", position: "50% 45%" },
  pet: { alt: "Illustrative AI scene of a woman spending a quiet moment with her dog", position: "50% 50%" },
  memorial: { alt: "Illustrative AI still life with a candle, flowers and a framed landscape", position: "50% 50%" },
  winter: { alt: "Illustrative AI still life with orange cake, warm mugs and winter lights", position: "50% 50%" },
  "christmas-eve": { alt: "Illustrative AI scene of a family sharing a quiet Christmas Eve", position: "50% 45%" },
  "new-year": { alt: "Illustrative AI scene of friends enjoying New Year lights together", position: "50% 45%" },
} as const;

export type GiftingScene = keyof typeof giftingScenes;

const occasionScenes: Record<string, GiftingScene> = {
  birthday: "birthday", wedding: "wedding", anniversary: "anniversary",
  family: "family", pet: "pet", memorial: "memorial", "in memory": "memorial",
  christmas: "winter", "christmas-eve": "christmas-eve", "christmas eve": "christmas-eve",
  "new-year": "new-year", "new year": "new-year", "new year's day": "new-year",
};

export function sceneForOccasion(occasion: string): GiftingScene {
  const key = occasion.toLowerCase();
  return Object.hasOwn(occasionScenes, key) ? occasionScenes[key] : "anniversary";
}
