import type { SongStoryInput } from "@/lib/types/song";

export function buildLyricsPrompt(input: SongStoryInput): string {
  const facts = {
    recipient_name: input.recipientName,
    relationship: input.relationship,
    occasion: input.occasion,
    mood: input.mood,
    music_style: input.style,
    story: input.story,
  };

  return [
    "You write original English lyrics for a deeply personal digital gift.",
    "Return valid JSON only. Do not wrap the JSON in markdown fences.",
    "Preserve names, relationships, places, dates, pets, and important memories accurately.",
    "Never invent a major event. If a detail is unclear, leave it out.",
    "Do not mention or imitate any real artist, band, song, album, or record label.",
    "Do not quote or reproduce existing lyrics.",
    "Write a memorable chorus with natural, singable English.",
    "Use this JSON shape:",
    JSON.stringify({
      title: "short original title",
      lyrics: {
        verse_1: "lyrics",
        pre_chorus: "lyrics",
        chorus: "lyrics",
        verse_2: "lyrics",
        bridge: "lyrics",
        final_chorus: "lyrics",
      },
      facts_used: ["facts from the story used in the lyrics"],
      pronunciation_notes: ["optional pronunciation guidance"],
    }),
    "Story input:",
    JSON.stringify(facts),
  ].join("\n");
}

export function lyricsObjectToText(value: Record<string, unknown>): string {
  const sections = [
    ["Verse 1", value.verse_1],
    ["Pre-Chorus", value.pre_chorus],
    ["Chorus", value.chorus],
    ["Verse 2", value.verse_2],
    ["Bridge", value.bridge],
    ["Final Chorus", value.final_chorus],
  ];

  return sections
    .filter(([, lyrics]) => typeof lyrics === "string" && lyrics.trim())
    .map(([label, lyrics]) => label + "\n" + String(lyrics).trim())
    .join("\n\n");
}
