import type { SongStoryInput } from "@/lib/types/song";
import { getLyricsProvider } from "@/lib/providers/factory";
import { moderateSongText } from "./moderation";

export async function generateCheckedLyrics(input: SongStoryInput) {
  const { recipientName, relationship, occasion, story, mood, style } = input;
  await moderateSongText(JSON.stringify({ recipientName, relationship, occasion, story, mood, style }));
  const result = await getLyricsProvider().generateLyrics(input);
  await moderateSongText(JSON.stringify({ title: result.title, lyrics: result.lyricsText }));
  return result;
}
