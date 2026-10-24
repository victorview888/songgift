import type { LyricsGenerationResult, SongStoryInput } from "@/lib/types/song";
import { buildLyricsPrompt, lyricsObjectToText } from "@/lib/prompts/lyrics";
import type { LyricsProvider } from "./lyrics-provider";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

function parseModelOutput(text: string): {
  title: string;
  lyricsText: string;
  factsUsed: string[];
  pronunciationNotes: string[];
} {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text
    .replace(new RegExp("^" + fence + "json\\s*", "i"), "")
    .replace(new RegExp("^" + fence + "\\s*"), "")
    .replace(new RegExp("\\s*" + fence + "$"), "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const lyricsValue = parsed.lyrics;
    const lyricsText =
      typeof lyricsValue === "string"
        ? lyricsValue
        : lyricsValue && typeof lyricsValue === "object"
          ? lyricsObjectToText(lyricsValue as Record<string, unknown>)
          : cleaned;
    const factsUsed = Array.isArray(parsed.facts_used)
      ? parsed.facts_used.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const pronunciationNotes = Array.isArray(parsed.pronunciation_notes)
      ? parsed.pronunciation_notes.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : "Your Song",
      lyricsText,
      factsUsed,
      pronunciationNotes,
    };
  } catch {
    return {
      title: "Your Song",
      lyricsText: cleaned,
      factsUsed: [],
      pronunciationNotes: [],
    };
  }
}

export class GeminiFlashProvider implements LyricsProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  }

  async generateLyrics(input: SongStoryInput): Promise<LyricsGenerationResult> {
    if (!this.apiKey) {
      const error = new Error(
        "GEMINI_API_KEY is missing. Add it to .env.local or use LYRICS_PROVIDER=mock.",
      );
      error.name = "ProviderConfigurationError";
      throw error;
    }

    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(this.model) +
      ":generateContent";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildLyricsPrompt(input) }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 600);
      if (
        response.status === 403 &&
        details.includes("Your project has been denied access")
      ) {
        const error = new Error(
          "Google has restricted this Gemini API key's project. Check its status in Google AI Studio and contact Google support to restore access. Creating another key in the same project will not resolve this error.",
        );
        error.name = "ProviderConfigurationError";
        throw error;
      }
      throw new Error("Gemini request failed (" + response.status + "): " + details);
    }

    const payload = (await response.json()) as GeminiResponse;
    const text =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "";
    if (!text) throw new Error("Gemini returned an empty lyrics response.");

    return {
      provider: "gemini",
      model: this.model,
      status: "completed",
      ...parseModelOutput(text),
    };
  }
}
