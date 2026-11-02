"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountHeader } from "@/components/account-header";
import { useAccount } from "@/components/account-provider";
import type { AccountOrder } from "@/lib/types/account";

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAccount();
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { window.location.replace("/login?next=" + encodeURIComponent("/song/" + id)); return; }
    if (id === "demo") { window.location.replace("/my-songs"); return; }
    let active = true;
    let timer: number | undefined;
    async function update() {
      try {
        const response = await fetch("/api/orders/" + id, { cache: "no-store" });
        if (response.status === 401) { window.location.replace("/login?next=" + encodeURIComponent("/song/" + id)); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "We couldn't load this song.");
        if (!active) return;
        const current = data.order as AccountOrder;
        setOrder(current); setLoading(false); setError("");
        if (current.status === "generating" && !current.song_assets.length) {
          if (current.provider_job_id) {
            const status = await fetch(`/api/music/status/${encodeURIComponent(current.provider_job_id)}?orderId=${id}`, { cache: "no-store" });
            const result = await status.json();
            if (!status.ok) throw new Error(result.error || "We couldn't check your song. Please try again.");
          }
          if (active) timer = window.setTimeout(update, 8000);
        }
      } catch (caught) { if (active) { setError(caught instanceof Error ? caught.message : "Please try again."); setLoading(false); } }
    }
    void update();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [id, user, authLoading]);
  const ready = !!order?.song_assets.length;
  const failed = order?.status === "failed";
  return <main className="form-page result-page"><AccountHeader step="Your song" /><section className="result-shell"><div className={playing ? "result-record is-playing" : "result-record"} aria-hidden="true"><div className="record-label">♪</div></div><div className="result-copy"><p className="section-kicker">{ready ? "Made from your memories" : failed ? "Your song needs attention" : "Your personal song"}</p><h1>{loading ? "Finding your song…" : order ? order.title || `For ${order.recipient_name}, with all your heart.` : "Let's find your song."}</h1>{error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => window.location.reload()}>Try again</button></p>}{order && <><p>{ready ? `A song for ${order.recipient_name}, made from the story you shared. Press play when you're ready.` : failed ? "We couldn't finish this song. Your order is saved in My Songs." : order.status === "generating" ? "We're turning your story into music. You can leave this page and return to My Songs to check its progress." : "Your lyrics are saved. Continue your song when you're ready."}</p>{ready ? <audio className="audio-player" aria-label="Your personalized song" controls preload="metadata" src={`/api/orders/${id}/audio`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} /> : <div className="song-progress-note" role="status">{order.status === "generating" ? "♫ Creating your song…" : failed ? "Generation was unsuccessful. Your order details are saved." : "Your draft is ready to review."}</div>}<div className="result-actions">{ready ? <a className="primary-button" href={`/api/orders/${id}/audio?download=1`}>Download song <span aria-hidden="true">↓</span></a> : order.status !== "generating" && !failed ? <Link href={`/lyrics/${id}`} className="primary-button">Continue song <span aria-hidden="true">↗</span></Link> : null}<Link className="text-link" href="/my-songs">← My Songs</Link></div>{order.lyrics_text && <details className="saved-lyrics"><summary>Read the lyrics</summary><pre>{order.lyrics_text}</pre></details>}<p className="result-note">Order {order.id.slice(0, 8).toUpperCase()} · {order.occasion} · {order.paid_at ? "Paid" : "Not purchased"}</p></>}{!order && !loading && <Link href="/my-songs" className="primary-button">Go to My Songs <span aria-hidden="true">↗</span></Link>}</div></section></main>;
}
