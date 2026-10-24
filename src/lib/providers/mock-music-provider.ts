import type { MusicGenerationInput, MusicGenerationResult } from "@/lib/types/song";
import type { MusicProvider } from "./music-provider";

export class MockMusicProvider implements MusicProvider {
  async generateSong(input: MusicGenerationInput): Promise<MusicGenerationResult> {
    void input;
    return {
      provider: "mock",
      model: "local-preview",
      status: "mock",
      message: "Local preview mode. Add a configured music provider API key to generate a real audio file.",
      mimeType: "audio/mpeg",
    };
  }

  async getStatus(): Promise<MusicGenerationResult> {
    return {
      provider: "mock",
      model: "local-preview",
      status: "mock",
      message: "Local preview mode.",
    };
  }
}
