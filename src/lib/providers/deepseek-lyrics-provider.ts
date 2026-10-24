import { buildLyricsPrompt, lyricsObjectToText } from "@/lib/prompts/lyrics";
import type { LyricsGenerationResult, SongStoryInput } from "@/lib/types/song";
import type { LyricsProvider } from "./lyrics-provider";

type DeepSeekResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
  }>;
};

function parseLyrics(content: string) {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const lyrics = parsed.lyrics;
  const lyricsText =
    typeof lyrics === "string"
      ? lyrics.trim()
      : lyrics && typeof lyrics === "object" && !Array.isArray(lyrics)
        ? lyricsObjectToText(lyrics as Record<string, unknown>)
        : "";

  if (!lyricsText) throw new Error("DeepSeek returned no usable lyrics.");

  return {
    title:
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : "Your Song",
    lyricsText,
    factsUsed: Array.isArray(parsed.facts_used)
      ? parsed.facts_used.filter((item): item is string => typeof item === "string")
      : [],
    pronunciationNotes: Array.isArray(parsed.pronunciation_notes)
      ? parsed.pronunciation_notes.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export class DeepSeekLyricsProvider implements LyricsProvider {
  private readonly apiKey = process.env.DEEPSEEK_API_KEY || "";
  private readonly model = process.env.DEEPSEEK_MODEL || "deepseek-flash";

  async generateLyrics(input: SongStoryInput): Promise<LyricsGenerationResult> {
    if (!this.apiKey) {
      const error = new Error(
        "DEEPSEEK_API_KEY is missing. Add it to .env.local to generate real lyrics.",
      );
      error.name = "ProviderConfigurationError";
      throw error;
    }

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: buildLyricsPrompt(input) }],
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        max_tokens: 3072,
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const error = new Error(
          "DeepSeek rejected DEEPSEEK_API_KEY. Check the key in .env.local.",
        );
        error.name = "ProviderConfigurationError";
        throw error;
      }
      if (response.status === 402) {
        const error = new Error(
          "DeepSeek API balance is insufficient. Add credit to the DeepSeek account.",
        );
        error.name = "ProviderConfigurationError";
        throw error;
      }
      // Avoid forwarding provider responses that might contain account details.
      throw new Error(`DeepSeek lyrics request failed (HTTP ${response.status}).`);
    }

    const payload = (await response.json()) as DeepSeekResponse;
    const choice = payload.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new Error(
        "DeepSeek reached its output limit before finishing the lyrics. Try again with a shorter story.",
      );
    }
    const content = choice?.message?.content?.trim();
    if (!content) throw new Error("DeepSeek returned an empty lyrics response.");

    let lyrics: ReturnType<typeof parseLyrics>;
    try {
      lyrics = parseLyrics(content);
    } catch {
      throw new Error("DeepSeek returned invalid or incomplete lyrics JSON.");
    }

    return {
      provider: "deepseek",
      model: this.model,
      status: "completed",
      ...lyrics,
    };
  }
}
