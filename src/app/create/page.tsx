"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type StoryForm = {
  recipientName: string;
  relationship: string;
  occasion: string;
  story: string;
  mood: string;
  style: string;
  email: string;
};

const initialForm: StoryForm = {
  recipientName: "",
  relationship: "",
  occasion: "",
  story: "",
  mood: "Warm and heartfelt",
  style: "Acoustic pop",
  email: "",
};

export default function CreatePage() {
  const router = useRouter();
  const [form, setForm] = useState<StoryForm>(initialForm);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  function updateField(field: keyof StoryForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setError("");

    try {
      const orderId =
        sessionStorage.getItem("songgift-order-id") || crypto.randomUUID();
      const response = await fetch("/api/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, orderId }),
      });
      const payload = (await response.json()) as {
        error?: string;
        lyricsText?: string;
        [key: string]: unknown;
      };

      if (!response.ok || !payload.lyricsText) {
        throw new Error(payload.error || "Lyrics generation failed.");
      }

      sessionStorage.setItem("songgift-story", JSON.stringify(form));
      sessionStorage.setItem(
        "songgift-order-id",
        String(payload.orderId || orderId),
      );
      sessionStorage.setItem("songgift-lyrics-result", JSON.stringify(payload));
      router.push("/lyrics/demo");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Lyrics generation failed.",
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
        <span className="form-progress">Step 1 of 3</span>
      </header>

      <section className="form-shell">
        <div className="form-intro">
          <p className="section-kicker">Start with the story</p>
          <h1>Tell us about the person behind the song.</h1>
          <p>Share as much as feels natural. Names, places, tiny habits, and favorite memories are all welcome.</p>
        </div>

        <form className="story-form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label><span>Their name</span><input required value={form.recipientName} onChange={(event) => updateField("recipientName", event.target.value)} placeholder="e.g. Emma" /></label>
            <label><span>Your relationship</span><select required value={form.relationship} onChange={(event) => updateField("relationship", event.target.value)}>
              <option value="">Choose one</option><option>Partner</option><option>Spouse</option><option>Parent</option><option>Child</option><option>Friend</option><option>Family member</option><option>Pet</option><option>Someone I miss</option>
            </select></label>
          </div>
          <div className="field-grid">
            <label><span>What is the occasion?</span><select required value={form.occasion} onChange={(event) => updateField("occasion", event.target.value)}>
              <option value="">Choose one</option><option>Birthday</option><option>Wedding</option><option>Anniversary</option><option>Just because</option><option>Thank you</option><option>In memory</option>
            </select></label>
            <label><span>What should it feel like?</span><select value={form.mood} onChange={(event) => updateField("mood", event.target.value)}>
              <option>Warm and heartfelt</option><option>Joyful and bright</option><option>Romantic and intimate</option><option>Nostalgic and gentle</option><option>Uplifting and hopeful</option>
            </select></label>
          </div>
          <label><span>Tell us the story</span><textarea required rows={8} value={form.story} onChange={(event) => updateField("story", event.target.value)} placeholder="What do you love about them? Include a favorite memory, a place you share, a phrase they always say, or anything you want them to hear..." /><small>There is no perfect way to write this. Just write from the heart.</small></label>
          <div className="field-grid">
            <label><span>Music direction</span><select value={form.style} onChange={(event) => updateField("style", event.target.value)}>
              <option>Acoustic pop</option><option>Soft piano ballad</option><option>Indie folk</option><option>Uplifting pop</option><option>Country inspired</option>
            </select></label>
            <label><span>Your email</span><input required type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="you@example.com" /></label>
          </div>
          <div className="form-submit-row">
            <p><span aria-hidden="true">✦</span> You will review the lyrics before the song is made.</p>
            <button className="primary-button" type="submit" disabled={isGenerating}>
              {isGenerating ? "Writing lyrics..." : "Continue to lyrics"}
              {!isGenerating && <span aria-hidden="true">↗</span>}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}
