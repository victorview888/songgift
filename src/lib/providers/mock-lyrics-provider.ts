import type { LyricsGenerationResult, SongStoryInput } from "@/lib/types/song";
import type { LyricsProvider } from "./lyrics-provider";

export class MockLyricsProvider implements LyricsProvider {
  async generateLyrics(input: SongStoryInput): Promise<LyricsGenerationResult> {
    const name = input.recipientName.trim() || "someone special";
    const place = input.story.match(/\b(?:in|at|near|from)\s+([A-Z][A-Za-z-]+)/)?.[1];

    return {
      provider: "mock",
      model: "local-preview",
      status: "mock",
      title: "A Song for " + name,
      factsUsed: [name, input.occasion, input.mood, place].filter(
        (value): value is string => Boolean(value),
      ),
      pronunciationNotes: [],
      lyricsText: [
        "Verse 1",
        "There are a thousand little reasons",
        "Why the world feels brighter when you are near",
        "From every ordinary moment we keep",
        "To every word I hope you hear",
        "",
        "Pre-Chorus",
        "Every road has led me here",
        "To say the words I hope you hear",
        "",
        "Chorus",
        "This is your song, " + name + ", for all that you are",
        "For every small light that has carried me far",
        "Through every season, wherever we go",
        "I hope you always know, you are loved more than you know",
        "",
        "Verse 2",
        "I remember the laughter, the places, the dreams",
        "The quiet promises and the in-between",
        "And all of the moments that feel like home",
        "Because every memory is better with you",
        "",
        "Bridge",
        "If the years keep moving, let them move on",
        "Some things stay true when everything is gone",
        "Your story is written in the best parts of me",
        "And this is the song you will always be",
      ].join("\n"),
    };
  }
}
