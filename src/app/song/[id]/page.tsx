"use client";
import { ArrowIcon } from "@/components/arrow-icon";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountHeader } from "@/components/account-header";
import { useAccount } from "@/components/account-provider";
import { GiftSettings } from "@/components/gift-settings";
import { SongAudio } from "@/components/song-audio";
import type { AccountOrder } from "@/lib/types/account";

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAccount();
  return <SongPlayer key={`${user?.id || "visitor"}:${id}`} />;
}

function SongPlayer() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAccount();
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [revision, setRevision] = useState(0);
  const userId = user?.id;
  useEffect(() => {
    if (authLoading) return;
    if (!userId) { window.location.replace("/login?next=" + encodeURIComponent("/song/" + id)); return; }
    if (id === "demo") { window.location.replace("/my-songs"); return; }
    let active = true;
    let failures = 0;
    const controller = new AbortController();
    let timer: number | undefined;
    async function update() {
      try {
        const response = await fetch("/api/orders/" + id, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { window.location.replace("/login?next=" + encodeURIComponent("/song/" + id)); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "We couldn't load this song.");
        if (!active) return;
        const current = data.order as AccountOrder;
        setOrder(current); setLoading(false); setError(""); setCheckedAt(new Date().toLocaleTimeString());
        if (current.status === "generating" && !current.song_assets.length) {
          if (current.active_generation_job_id || current.provider_job_id) {
            const status = await fetch(`/api/music/status/${encodeURIComponent(current.active_generation_job_id || current.provider_job_id!)}?orderId=${id}`, { cache: "no-store", signal: controller.signal });
            const result = await status.json();
            if (!status.ok) throw new Error(result.error || "We couldn't check your song. Please try again.");
            if (!active) return;
            setPhase(result.phase || result.status);
            if (result.status === "needs_review" || result.status === "failed") return;
          }
          failures = 0;
          if (active) timer = window.setTimeout(update, 8000);
        }
      } catch (caught) { if (active) { setError(caught instanceof Error ? caught.message : "Please try again."); setLoading(false); if (++failures <= 3) timer = window.setTimeout(update, 8000 * failures); } }
    }
    void update();
    return () => { active = false; controller.abort(); if (timer) window.clearTimeout(timer); };
  }, [id, userId, authLoading, revision]);
  const ready = !!order?.song_assets.length;
  const failed = order?.status === "failed" || phase === "failed";
  const needsHelp = phase === "needs_review";
  const stageLabel = ({ submitting: "Submitting your song", queued: "Your song is in the queue", processing: "Creating your song", storing: "Saving your audio", needs_review: "Your song needs assistance", failed: "Your song needs attention" } as Record<string, string>)[phase] || "Creating your song";
  return <main className="form-page result-page"><AccountHeader step="Your song" /><section className="result-shell"><div className={playing ? "result-record is-playing" : "result-record"} aria-hidden="true"><div className="record-label">♪</div></div><div className="result-copy"><p className="section-kicker">{ready ? "Made from your memories" : failed || needsHelp ? "Your song needs attention" : "Your personal song"}</p><h1>{loading ? "Finding your song…" : order ? order.title || `For ${order.recipient_name}, with all your heart.` : "Let's find your song."}</h1>{error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setRevision(value => value + 1)}>Try again</button></p>}{order && <><p>{ready ? `A song for ${order.recipient_name}, made from the story you shared. Press play when you're ready.` : needsHelp ? "We need to check this task. Your payment and order are saved. Contact us with the order reference below." : failed ? "We couldn't finish this song. Your order is saved in My Songs." : order.status === "generating" ? "We're turning your story into music. You can leave this page and return to My Songs to check its progress." : "Your lyrics are saved. Continue your song when you're ready."}</p>{ready ? <SongAudio orderId={id} onPlaying={setPlaying} /> : <div className="song-progress-note" role="status">{order.status === "generating" ? stageLabel : failed ? "Generation was unsuccessful. Your order details are saved." : "Your draft is ready to review."}</div>}{!ready && checkedAt && <p className="last-checked">Last checked {checkedAt} · <button className="text-button" onClick={() => setRevision(value => value + 1)}>Check again</button></p>}<div className="result-actions">{!ready && order.status !== "generating" && !failed ? <Link href={`/lyrics/${id}`} className="primary-button">Continue song <ArrowIcon /></Link> : null}<Link className="text-link" href="/my-songs">← My Songs</Link></div>{order.lyrics_text && <details className="saved-lyrics"><summary>Read the lyrics</summary><pre>{order.lyrics_text}</pre></details>}<p className="result-note">Order {order.id.slice(0, 8).toUpperCase()} · {order.occasion} · {order.paid_at ? "Paid" : "Not purchased"}</p><div className="draft-actions"><Link className="text-link" href={"/account/payments/" + order.id}>Payment record</Link><Link className="text-link" href={"/contact?orderId=" + order.id}>Get help with this order</Link><Link className="text-link" href={"/report?reference=" + order.id}>Report content / appeal</Link></div></>}{!order && !loading && <Link href="/my-songs" className="primary-button">Go to My Songs <ArrowIcon /></Link>}</div>{ready && <GiftSettings orderId={id} key={userId+":"+id}/>}</section></main>;
}
