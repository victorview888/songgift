import type { MusicGenerationInput, MusicGenerationResult } from "@/lib/types/song";

export interface MusicProvider {
  generateSong(input: MusicGenerationInput): Promise<MusicGenerationResult>;
  getStatus?(jobId: string): Promise<MusicGenerationResult>;
}
