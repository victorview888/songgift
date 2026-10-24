"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const starterLyrics = [
  "Verse 1",
  "There are a thousand little reasons",
  "Why the world feels brighter when you are near",
  "From the way you turn an ordinary moment",
  "Into something I will always hold dear",
  "",
  "Pre-Chorus",
  "And every road has led me here",
  "To say the words I hope you hear",
  "",
  "Chorus",
  "This is your song, for all that you are",
  "For every small light that has carried me far",
  "Through every season, wherever we go",
  "I hope you always know, you are loved more than you know",
  "",
  "Verse 2",
  "I remember the moments we keep",
  "The quiet promises, the laughter, the dreams",
  "And all of the places that feel like home",
  "Because every memory is better with you",
  "",
  "Bridge",
  "If the years keep moving, let them move on",
  "Some things stay true when everything is gone",
  "Your story is written in the best parts of me",
  "And this is the song you will always be",
].join("\n");

export default function LyricsPage() {
  const router = useRouter();
  const [recipient, setRecipient] = useState("someone special");
  const [lyrics, setLyrics] = useState(starterLyrics);
  const [title, setTitle] = useState("Untitled song");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedStory = sessionStorage.getItem("songgift-story");
    const savedLyrics = sessionStorage.getItem("songgift-lyrics-result");
    const parsedStory = savedStory
      ? (JSON.parse(savedStory) as { recipientName?: string })
      : {};
    const parsedLyrics = savedLyrics
      ? (JSON.parse(savedLyrics) as { title?: string; lyricsText?: string })
      : {};
    const name = parsedStory.recipientName;
    const generatedTitle = parsedLyrics.title;
    const generatedLyrics = parsedLyrics.lyricsText;

    window.setTimeout(() => {
      if (name) setRecipient(name);
      if (generatedTitle) setTitle(generatedTitle);
      if (generatedLyrics) setLyrics(generatedLyrics);
    }, 0);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setError("");

    try {
      const savedStory = sessionStorage.getItem("songgift-story");
      const story = savedStory
        ? (JSON.parse(savedStory) as {
            recipientName?: string;
            occasion?: string;
            story?: string;
          mood?: string;
          style?: string;
          })
        : {};
      const response = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: story.recipientName || recipient,
          occasion: story.occasion || "",
          story: story.story || "",
          mood: story.mood || "",
          style: story.style || "",
          lyricsText: lyrics,
          orderId: sessionStorage.getItem("songgift-order-id") || undefined,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        [key: string]: unknown;
      };
      if (!response.ok) throw new Error(payload.error || "Music generation failed.");

      sessionStorage.setItem("songgift-lyrics", lyrics);
      sessionStorage.setItem("songgift-result", JSON.stringify(payload));
      router.push("/song/demo");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Music generation failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="form-page">
      <header className="site-header form-header">
        <Link className="brand-link" href="/" aria-label="SongGift home">
          <span className="brand"><span className="brand-mark" aria-hidden="true">♪</span>songgift</span>
        </Link>
        <span className="form-progress">Step 2 of 3</span>
      </header>
      <section className="form-shell lyrics-shell">
        <div className="form-intro">
          <p className="section-kicker">Your first draft</p>
          <h1>A song for {recipient} starts here.</h1>
          <p>Read through the lyrics and make any changes you would like. The story should sound like you.</p>
        </div>
        <form className="story-form lyrics-form" onSubmit={handleSubmit}>
          <div className="lyrics-toolbar"><span>{title}</span><small>Draft saved locally</small></div>
          <textarea className="lyrics-editor" aria-label="Song lyrics" value={lyrics} onChange={(event) => setLyrics(event.target.value)} />
          <div className="form-submit-row">
            <Link className="text-link" href="/create">← Edit story</Link>
            <button className="primary-button" type="submit" disabled={isGenerating}>
              {isGenerating ? "Creating music..." : "Continue to song"}
              {!isGenerating && <span aria-hidden="true">↗</span>}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}
