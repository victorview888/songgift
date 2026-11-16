"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Summary = { enabled: boolean; canCreate: boolean; used: boolean; state: string | null; lyricsLocked: boolean; audioUrl: string | null; seconds: number | null; paid: boolean };
type Props = { orderId: string; paid: boolean; onPrepare: () => Promise<void>; onState: (locked: boolean, ready: boolean, state: string | null) => void; onBusy: (busy: boolean) => void };
export function SongPreview({ orderId, paid, onPrepare, onState, onBusy }: Props) {
  const [data, setData] = useState<Summary | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true), inFlight = useRef(false), polls = useRef(0);
  const read = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/orders/${orderId}/preview`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your preview is temporarily unavailable.");
      if (alive.current) { setData(body); setError(""); }
    } catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "Please check again."); }
    finally { inFlight.current = false; }
  }, [orderId]);
  useEffect(() => { alive.current = true; const timer = window.setTimeout(() => void read(), 0); return () => { alive.current = false; window.clearTimeout(timer); }; }, [read, paid]);
  useEffect(() => { if (data) onState(data.lyricsLocked, data.state === "ready", data.state); }, [data, onState]);
  const processing = Boolean(data?.state && ["submitting", "queued", "processing", "storing"].includes(data.state));
  useEffect(() => {
    if (!processing || error || polls.current >= 90) return;
    const timer = window.setTimeout(() => { polls.current++; void read(); }, 10000);
    return () => window.clearTimeout(timer);
  }, [processing, data, error, read]);
  async function create() {
    if (busy || !data?.canCreate) return;
    setBusy(true); onBusy(true); setError("");
    try {
      await onPrepare();
      const response = await fetch(`/api/orders/${orderId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your preview could not be started.");
      if (alive.current) { setData(body); polls.current = 0; }
    } catch (caught) {
      // A lost response is not permission to submit again. Read the reserved task.
      await read();
      if (alive.current) setError(caught instanceof Error ? caught.message : "Please check the existing request.");
    } finally { if (alive.current) setBusy(false); onBusy(false); }
  }
  return <section className="song-preview-panel" aria-labelledby="song-preview-heading">
    <p className="section-kicker">Hear your story</p><h2 id="song-preview-heading">Your free 60-second preview.</h2>
    <p>One free audio creation per verified account, subject to availability. Listen to up to 60 seconds and replay the excerpt as often as you like.</p>
    {!data && !error && <p role="status">Checking your preview allowance…</p>}
    {data?.canCreate && !paid && <><p>Finish your lyric edits first. Starting the recording locks these words; a new recording is a separate creation.</p><button className="primary-button" type="button" disabled={busy} onClick={() => void create()}>{busy ? "Preparing your preview…" : data.state === "failed" ? "Retry my free preview" : "Create my free preview"}</button></>}
    {processing && <p role="status">{data?.state === "storing" ? "Saving your audio preview…" : "Creating your original recording…"} Your request is saved. Checking it does not create another song.</p>}
    {data?.state === "ready" && data.audioUrl && <><audio ref={audio} controls preload="none" src={data.audioUrl} aria-label="Your 60-second song preview" onError={() => setAudioError(true)} />{audioError && <p role="status">This preview could not load. <button className="text-button" type="button" onClick={() => { setAudioError(false); audio.current?.load(); }}>Reload preview</button></p>}<p>{paid ? "Your payment is recorded. Continue below to open the full song." : "Like what you hear? Pay once below to unlock this same full recording, download it and give it as a gift."}</p></>}
    {data?.state === "needs_review" && <p>Your original request needs checking. No new song will be submitted automatically. Use the order help link below.</p>}
    {data && !data.canCreate && !data.state && !paid && <p>Your free audio allowance is unavailable or already used. You can still pay once to create this song.</p>}
    {data?.state === "failed" && <p>The music service could not finish this recording. A confirmed technical failure restores your free allowance; retry availability is checked before submitting. You can also return to My Songs and start a separate story.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {(error || data?.state && data.state !== "ready") && <button type="button" className="text-button" disabled={busy} onClick={() => void read()}>Check preview again</button>}
    <p className="preview-small">Only the excerpt is available before purchase. The full recording stays private until payment is confirmed.</p>
  </section>;
}
