import type { LyricsGenerationResult, SongStoryInput } from "@/lib/types/song";

export interface LyricsProvider {
  generateLyrics(input: SongStoryInput): Promise<LyricsGenerationResult>;
}
