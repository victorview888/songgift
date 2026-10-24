import type { MusicGenerationInput } from "@/lib/types/song";

export function buildMusicPrompt(input: MusicGenerationInput): string {
  return [
    "Create a complete original personalized song in English.",
    "Song purpose: a heartfelt digital gift for " + input.occasion + ".",
    "Music style: " + input.style,
    "Mood: " + input.mood,
    "Vocal direction: warm, intimate, clear English vocals.",
    "Arrangement: a memorable chorus, emotional verses, gentle dynamic build, and a satisfying final chorus.",
    "Create an original composition. Do not imitate any real artist, band, song, album, or record label.",
    "Do not quote or reproduce existing lyrics.",
    "Keep the recipient name and personal details accurate.",
    "Recipient: " + input.recipientName,
    "Story details: " + input.story,
    "Approved lyrics:",
    input.lyricsText,
  ].join("\n\n");
}
