"use client";
import { trackUsage } from "@/lib/growth/usage-client";
import { ArrowIcon } from "@/components/arrow-icon";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AccountHeader } from "@/components/account-header";
import { TermsConfirmation } from "@/components/terms-confirmation";
import { useAccount } from "@/components/account-provider";
import { GiftingImage } from "@/components/gifting-image";
import { sceneForOccasion } from "@/lib/gifting-imagery";

import { ACCOUNT_CLEARED_EVENT, clearStoryDraft, initialStory, loadStoryDraft, newStoryDraft, saveStoryDraft, type StoryDraft, type StoryForm } from "@/lib/drafts/story";
import { holidayForOccasion, holidayOccasions } from "@/lib/holidays";
import { getOccasionPreset } from "@/lib/occasion-presets";

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
  const selectedHoliday = holidayForOccasion(form.occasion);
  useEffect(() => { owner.current = user?.id || null; }, [user?.id]);
  useEffect(() => {
    if (loading || loadedFor.current === (user?.id || "guest")) return;
    controller.current?.abort(); inFlight.current = false;
    const timer = window.setTimeout(() => {
      loadedFor.current = user?.id || "guest";
      const restored = loadStoryDraft(user?.id || null);
      const preset = getOccasionPreset(new URLSearchParams(window.location.search).get("occasion"));
      const next = restored ? { ...restored, ownerId: user?.id || null } : newStoryDraft(user?.id || null);
      if (!restored && preset) next.form.occasion = preset.occasion;
      draftRef.current = next; setDraft(next); setReady(true); setError(""); setIsGenerating(false);
      const saved = (!restored && !preset) || saveStoryDraft(next);
      if (!saved) clearStoryDraft();
      setNotice(!saved ? "Local saving is unavailable. Keep a copy of your story before leaving this page." : restored && preset && restored.form.occasion !== preset.occasion ? restored.orderId ? `Your saved song is unchanged. Continue it below, or choose Start a new story for ${preset.name}.` : `Your saved story is unchanged. Choose ${preset.name} in the occasion field if you want to adapt this draft.` : restored ? "Restored your saved story from this tab." : preset ? `${preset.name} is selected. Add your own memories below.` : "");
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
    clearStoryDraft(); const next = newStoryDraft(user?.id || null);
    const preset = getOccasionPreset(new URLSearchParams(window.location.search).get("occasion"));
    if (preset) next.form.occasion = preset.occasion;
    persist(next); setError("");
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
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const storyInput = event.currentTarget.elements.namedItem("story") as HTMLTextAreaElement;
    if (storyInput.value.trim().length < 20) {
      storyInput.setCustomValidity("Add at least 20 characters about your memories, excluding spaces at the beginning and end.");
      storyInput.reportValidity();
      return;
    }
    await submitStory();
  }

  return (
    <main className="form-page create-page">
      <AccountHeader step="Step 1 of 3" />

      <section className="form-shell create-shell">
        <div className="form-intro">
          <p className="section-kicker">Made from your memories</p>
          <h1>Every song starts with someone.</h1>
          <p>A favorite memory, a little habit, a few honest words. Tell us what makes them special. We’ll help you find the lyrics.</p>
          <div className="create-start-note"><span aria-hidden="true">✦</span> Free lyric draft <span className="create-note-dot" aria-hidden="true">·</span> No payment to start</div>
        </div>
        <ol className="create-journey" aria-label="Song creation steps">
          <li aria-current="step"><span>1</span> Your story</li>
          <li><span>2</span> Review lyrics</li>
          <li><span>3</span> Create song</li>
        </ol>
        <div className="create-layout">
        <div className="create-main">
        <div className="account-save-note">{user ? <>Your lyrics will be saved to <strong>{user.email}</strong> · <Link href="/my-songs">My Songs</Link></> : <>Start with your story. <Link href="/login?next=/create">Sign in</Link> when you’re ready to create your lyrics.</>}</div>
        <p className="draft-status create-draft-status" role="status">{!ready ? "Getting your story ready…" : notice}</p>
        {ready && activeDraft?.orderId ? <section className="draft-resume" aria-label="Saved song"><h2>Continue where you left off.</h2><p>Continue your saved song to review its lyrics or resume checkout.</p><div className="draft-actions">{activeDraft.stage === "ready" ? <Link className="primary-button" href={"/lyrics/" + activeDraft.orderId}>Continue saved song <ArrowIcon /></Link> : <button className="primary-button" disabled={isGenerating} onClick={() => void submitStory()}>{isGenerating ? "Checking your saved story…" : "Continue saved story"}</button>}<button className="text-button" disabled={isGenerating} onClick={startNew}>Start a new story</button></div></section> : <form className="story-form" onSubmit={handleSubmit}>
          <fieldset className="story-fields" disabled={!ready || !activeDraft || isGenerating || loading}>
          <section className="create-section" aria-labelledby="recipient-heading">
          <div className="create-section-heading"><span className="create-section-number" aria-hidden="true">01</span><div><h2 id="recipient-heading">Who is it for?</h2><p>Start with the person behind the song.</p></div></div>
          <div className="field-grid create-recipient-grid">
            <div><label htmlFor="recipient-name"><span id="recipient-name-label">Their name</span><input id="recipient-name" name="recipientName" aria-labelledby="recipient-name-label" required pattern={".*\\S.*"} maxLength={100} autoComplete="off" value={form.recipientName} onChange={(event) => updateField("recipientName", event.target.value)} placeholder="e.g. Emma" aria-describedby="recipient-name-hint" /></label><small id="recipient-name-hint">The name you’d like in the lyrics.</small></div>
            <label htmlFor="relationship"><span id="relationship-label">Your relationship</span><select id="relationship" name="relationship" aria-labelledby="relationship-label" required value={form.relationship} onChange={(event) => updateField("relationship", event.target.value)}>
              <option value="">Choose one</option><option>Partner</option><option>Spouse</option><option>Parent</option><option>Child</option><option>Friend</option><option>Family member</option><option>Pet</option><option>Someone I miss</option>
            </select></label>
            <label htmlFor="occasion"><span id="occasion-label">What is the occasion?</span><select id="occasion" name="occasion" aria-labelledby="occasion-label" required value={form.occasion} onChange={(event) => updateField("occasion", event.target.value)}>
              <option value="">Choose one</option><option>Birthday</option><option>Wedding</option><option>Anniversary</option><option>Just because</option><option>Thank you</option><option>In memory</option>{holidayOccasions.map(holiday => <option key={holiday.slug} value={holiday.occasion}>{holiday.name}</option>)}
            </select></label>
          </div>
          </section>
          <section className="create-section" aria-labelledby="memories-heading">
          <div className="create-section-heading"><span className="create-section-number" aria-hidden="true">02</span><div><h2 id="memories-heading">The memories that matter</h2><p>Write naturally. A few sentences are enough to begin.</p></div></div>
          <ul className="create-story-prompts" aria-label="Ideas for your story">
            <li><strong>A shared memory</strong><span>A moment or place you remember.</span></li>
            <li><strong>A little detail</strong><span>A habit, a nickname, a favorite phrase.</span></li>
            <li><strong>A message for them</strong><span>What you want this song to say.</span></li>
          </ul>
          <p id="story-hint" className="writing-hint">{selectedHoliday?.storyHint || "You don’t need to rhyme or write polished lyrics. Specific details help make the song yours."}{selectedHoliday && <> <Link href={`/occasions/${selectedHoliday.slug}`} target="_blank" rel="noopener">More {selectedHoliday.name} ideas</Link></>}</p>
          <label htmlFor="story"><span id="story-label">Tell us the story</span><textarea id="story" name="story" aria-labelledby="story-label" required minLength={20} maxLength={8000} rows={7} value={form.story} onChange={(event) => { event.target.setCustomValidity(""); updateField("story", event.target.value); }} placeholder={selectedHoliday?.storyPlaceholder || "One memory that always makes me smile is…\nThey have this little habit of…\nWith this song, I want to say…"} aria-describedby="story-hint story-count" /></label>
          <div className="create-story-tools"><span id="story-count" className="story-count">{form.story.length.toLocaleString()} / 8,000 characters · {form.story.trim().length < 20 ? "Add at least 20 characters" : "Ready to turn into lyrics"}</span></div>
          <details className="create-story-example"><summary>Need a starting point? See an example</summary><div><p className="create-example-label">Fictional example · Use your own memories</p><p>{form.occasion === "In memory" ? "My dad Alex made pancakes every Sunday, always a little too crispy. On rainy afternoons we listened to his old records in the kitchen. I want a gentle song that remembers those ordinary moments and says how much I still carry them with me." : "My friend Alex brought a thermos of tea on every walk, even in summer. Last autumn we got lost near the lake and laughed all the way home. Whenever life felt busy, Alex made time to listen. I want this song to say thank you for making ordinary days feel like an adventure."}</p></div></details>
          </section>
          <section className="create-section" aria-labelledby="feeling-heading">
          <div className="create-section-heading"><span className="create-section-number" aria-hidden="true">03</span><div><h2 id="feeling-heading">Give it a feeling <span className="create-optional">Optional</span></h2><p>Not sure? Our warm acoustic defaults are a good place to start.</p></div></div>
          <div className="field-grid"><label><span id="mood-label">What should it feel like?</span><select name="mood" aria-labelledby="mood-label" value={form.mood} onChange={(event) => updateField("mood", event.target.value)}>
              <option>Warm and heartfelt</option><option>Joyful and bright</option><option>Romantic and intimate</option><option>Nostalgic and gentle</option><option>Uplifting and hopeful</option>
            </select></label><label><span id="style-label">Music direction</span><select name="style" aria-labelledby="style-label" value={form.style} onChange={(event) => updateField("style", event.target.value)}>
              <option>Acoustic pop</option><option>Soft piano ballad</option><option>Indie folk</option><option>Uplifting pop</option><option>Country inspired</option>
            </select></label>
          </div>
          </section>
          <div className="create-submit-section">
          <p className="legal-notice">Your story, recipient details and lyrics are sent to AI services to create your lyrics and music. Share only details you have permission to use and leave out sensitive information. Please follow our <Link href="/policies/content-standards" target="_blank" rel="noopener">Content Standards</Link>.</p>
          <TermsConfirmation disabled={isGenerating || loading} />
          <div className="form-submit-row">
            <p><strong>Your lyrics come first.</strong><br />Review and edit them before you pay. <Link href="/pricing">View pricing</Link></p>
            <button className="primary-button" type="submit" disabled={!ready || !activeDraft || isGenerating || loading}>
              {isGenerating ? "Writing lyrics..." : user ? "Continue to lyrics" : "Sign in to continue"}
              {!isGenerating && <ArrowIcon />}
            </button>
          </div>
          </div>
          </fieldset>
        </form>}
        {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <aside className="create-companion" aria-labelledby="song-outline-heading">
          <div className="create-cover"><GiftingImage scene={sceneForOccasion(form.occasion)} sizes="300px" decorative /><span>Inspired by your story</span></div>
          <div className="create-companion-body"><p className="section-kicker">A gift with their name on it</p><h2 id="song-outline-heading">{form.recipientName.trim() ? <>A song for <em>{form.recipientName.trim()}</em>.</> : <>Someone special.<br />Something personal.</>}</h2>
          <dl><div><dt>Occasion</dt><dd>{form.occasion || "Your reason to celebrate"}</dd></div><div><dt>Feeling</dt><dd>{form.mood}</dd></div><div><dt>Sound</dt><dd>{form.style}</dd></div></dl>
          <div className="create-next-note"><strong>What happens next?</strong><p>We turn your memories into a lyric draft. Read it, edit it, and decide when you’re ready to make the song.</p></div>
          </div>
        </aside>
        </div>
      </section>
    </main>
  );
}
