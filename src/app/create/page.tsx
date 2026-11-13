"use client";
import { trackUsage } from "@/lib/growth/usage-client";
import { ArrowIcon } from "@/components/arrow-icon";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AccountHeader } from "@/components/account-header";
import { TermsConfirmation } from "@/components/terms-confirmation";
import { useAccount } from "@/components/account-provider";

import { ACCOUNT_CLEARED_EVENT, clearStoryDraft, initialStory, loadStoryDraft, newStoryDraft, saveStoryDraft, type StoryDraft, type StoryForm } from "@/lib/drafts/story";

export default function CreatePage() {
  const router = useRouter();
  const { user, loading } = useAccount();
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const draftRef = useRef<StoryDraft | null>(null);
  const loadedFor = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const owner = useRef<string | null>(user?.id || null);
  const [ready, setReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const activeDraft = draft?.ownerId === (user?.id || null) ? draft : null;
  const form = activeDraft?.form || initialStory;
  useEffect(() => { owner.current = user?.id || null; }, [user?.id]);
  useEffect(() => {
    if (loading || loadedFor.current === (user?.id || "guest")) return;
    controller.current?.abort(); inFlight.current = false;
    const timer = window.setTimeout(() => {
      loadedFor.current = user?.id || "guest";
      const restored = loadStoryDraft(user?.id || null);
      const next = restored || newStoryDraft(user?.id || null);
      draftRef.current = next; setDraft(next); setReady(true); setError(""); setIsGenerating(false);
      const saved = !restored || saveStoryDraft(next);
      if (!saved) clearStoryDraft();
      setNotice(!saved ? "Local saving is unavailable. Keep a copy of your story before leaving this page." : restored ? "Restored your saved story from this tab." : "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, user?.id]);
  useEffect(() => {
    const cleared = () => { controller.current?.abort(); inFlight.current = false; loadedFor.current = undefined; draftRef.current = null; setDraft(null); setReady(false); setNotice(""); setError(""); };
    window.addEventListener(ACCOUNT_CLEARED_EVENT, cleared);
    return () => { window.removeEventListener(ACCOUNT_CLEARED_EVENT, cleared); controller.current?.abort(); };
  }, []);
  function persist(next: StoryDraft) {
    draftRef.current = next; setDraft(next);
    setNotice(saveStoryDraft(next) ? "Draft saved in this tab for 24 hours." : "Local saving is unavailable. Keep a copy of your story before leaving this page.");
  }
  function updateField(field: keyof StoryForm, value: string) {
    const current = draftRef.current;
    if (!current || current.orderId || !ready || inFlight.current || current.form[field] === value) return;
    persist({ ...current, form: { ...current.form, [field]: value }, requestId: crypto.randomUUID(), savedAt: Date.now() });
  }
  function startNew() {
    clearStoryDraft(); const next = newStoryDraft(user?.id || null); draftRef.current = next; setDraft(next); setNotice(""); setError("");
  }
  async function submitStory() {
    if (inFlight.current || !draftRef.current) return;
    const current = draftRef.current;
    persist({ ...current, savedAt: Date.now() });
    if (!user) { router.push("/login?next=/create"); return; }
    inFlight.current = true; setIsGenerating(true); setError("");
    const submittedOwner = user.id, abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch("/api/lyrics", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ ...current.form, clientRequestId: current.requestId, draftOwnerId: submittedOwner }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Lyrics generation failed.");
      if (abort.signal.aborted || owner.current !== submittedOwner) return;
      if (typeof payload.orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.orderId)) throw new Error("Your saved story could not be opened. Please try again.");
      void trackUsage("story_submitted", payload.orderId);
      const next: StoryDraft = { ...current, ownerId: submittedOwner, orderId: payload.orderId, stage: payload.pending ? "writing" : "ready", savedAt: Date.now() };
      persist(next);
      if (payload.pending) {
        setNotice("Your story is saved. Checking the existing lyric-writing request…");
        let found = false;
        for (let i = 0; i < 8 && !abort.signal.aborted; i++) {
          const checked = await fetch("/api/orders/" + payload.orderId, { cache: "no-store", signal: abort.signal });
          const saved = await checked.json();
          if (!checked.ok) throw new Error(saved.error || "Your saved story is temporarily unavailable.");
          if (saved.order?.lyrics_text) { found = true; break; }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (abort.signal.aborted || owner.current !== submittedOwner) return;
        if (!found) { setNotice("Your story is saved. Continue this same story in a moment to check its lyrics."); return; }
      }
      if (abort.signal.aborted || owner.current !== submittedOwner) return;
      persist({ ...next, stage: "ready", savedAt: Date.now() });
      void trackUsage("lyrics_ready", payload.orderId);
      router.push("/lyrics/" + payload.orderId);
    } catch (caught) {
      if (!abort.signal.aborted && owner.current === submittedOwner) setError(caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      if (controller.current === abort) { inFlight.current = false; setIsGenerating(false); }
    }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await submitStory(); }

  return (
    <main className="form-page">
      <AccountHeader step="Step 1 of 3" />

      <section className="form-shell">
        <div className="form-intro">
          <p className="section-kicker">Start with the story</p>
          <h1>Every song starts with someone.</h1>
          <p>Share as much as feels natural. Names, places, tiny habits, and favorite memories are all welcome.</p>
        </div>

        <p className="legal-notice">See <Link href="/pricing">pricing, payment options and included services</Link> before you start. Please follow our <Link href="/policies/content-standards" target="_blank" rel="noopener">Content Standards</Link>.</p>
        <div className="account-save-note">{user ? <>Your song will be saved to <strong>{user.email}</strong>. Find it anytime in <Link href="/my-songs">My Songs</Link>.</> : <>Bring your story. <Link href="/login?next=/create">Sign in</Link> to save your lyrics and finished song to your account.</>}</div>
        {notice && <p className="draft-status" role="status">{notice}</p>}
        {ready && activeDraft?.orderId ? <section className="draft-resume" aria-label="Saved song"><h2>Continue where you left off.</h2><p>Continue your saved song to review its lyrics or resume checkout.</p><div className="draft-actions">{activeDraft.stage === "ready" ? <Link className="primary-button" href={"/lyrics/" + activeDraft.orderId}>Continue saved song <ArrowIcon /></Link> : <button className="primary-button" disabled={isGenerating} onClick={() => void submitStory()}>{isGenerating ? "Checking your saved story…" : "Continue saved story"}</button>}<button className="text-button" disabled={isGenerating} onClick={startNew}>Start a new story</button></div></section> : <form className="story-form" onSubmit={handleSubmit}>
          <fieldset className="story-fields" disabled={!ready || !activeDraft || isGenerating || loading}>
          <h2 className="form-group-heading"><span>01</span> Who is it for?</h2><div className="field-grid">
            <label><span>Their name</span><input required maxLength={100} value={form.recipientName} onChange={(event) => updateField("recipientName", event.target.value)} placeholder="e.g. Emma" /></label>
            <label><span>Your relationship</span><select required value={form.relationship} onChange={(event) => updateField("relationship", event.target.value)}>
              <option value="">Choose one</option><option>Partner</option><option>Spouse</option><option>Parent</option><option>Child</option><option>Friend</option><option>Family member</option><option>Pet</option><option>Someone I miss</option>
            </select></label>
          </div>
          <div className="field-grid">
            <label><span>What is the occasion?</span><select required value={form.occasion} onChange={(event) => updateField("occasion", event.target.value)}>
              <option value="">Choose one</option><option>Birthday</option><option>Wedding</option><option>Anniversary</option><option>Just because</option><option>Thank you</option><option>In memory</option>
            </select></label>

          </div>
          <h2 className="form-group-heading"><span>02</span> The memories that matter</h2><p className="writing-hint">Try a moment you shared, a little habit you love, and what you want them to know.</p><label><span>Tell us the story</span><textarea required minLength={20} maxLength={8000} rows={8} value={form.story} onChange={(event) => updateField("story", event.target.value)} placeholder="What do you love about them? Include a favorite memory, a place you share, a phrase they always say, or anything you want them to hear..." /><small className="story-count">{form.story.length.toLocaleString()} / 8,000 characters · {form.story.length < 20 ? "Add at least 20 characters" : "Ready to turn into lyrics"}</small></label>
          <h2 className="form-group-heading"><span>03</span> Give it a feeling</h2><div className="field-grid">            <label><span>What should it feel like?</span><select value={form.mood} onChange={(event) => updateField("mood", event.target.value)}>
              <option>Warm and heartfelt</option><option>Joyful and bright</option><option>Romantic and intimate</option><option>Nostalgic and gentle</option><option>Uplifting and hopeful</option>
            </select></label><label><span>Music direction</span><select value={form.style} onChange={(event) => updateField("style", event.target.value)}>
              <option>Acoustic pop</option><option>Soft piano ballad</option><option>Indie folk</option><option>Uplifting pop</option><option>Country inspired</option>
            </select></label>

          </div>
          <p className="legal-notice">Your story, recipient details and lyrics are sent to AI services to create your lyrics and music. Include only information you have permission to share, and leave out sensitive personal details. See our <Link href="/policies/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.</p>
          <TermsConfirmation disabled={isGenerating || loading} />
          <div className="form-submit-row">
            <p><span aria-hidden="true">✦</span> You will review the lyrics before the song is made.</p>
            <button className="primary-button" type="submit" disabled={isGenerating || loading}>
              {isGenerating ? "Writing lyrics..." : user ? "Continue to lyrics" : "Sign in to continue"}
              {!isGenerating && <ArrowIcon />}
            </button>
          </div>
          </fieldset>
        </form>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
