"use client";
import { ArrowIcon } from "@/components/arrow-icon";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountHeader } from "@/components/account-header";
import { AccountLinks } from "@/components/account-links";
import { useAccount } from "@/components/account-provider";
import { usePrivateResource } from "@/components/use-private-resource";
import { SongAudio } from "@/components/song-audio";
import type { AccountOrder } from "@/lib/types/account";

const EMPTY_ORDERS: AccountOrder[] = [];

export default function MySongsPage() {
  const { user, loading: authLoading } = useAccount();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const resource = usePrivateResource<{orders: AccountOrder[]; total: number}>(`/api/orders?page=${page}&filter=${filter}`, "/my-songs");
  const orders = resource.data?.orders || EMPTY_ORDERS;
  const total = resource.data?.total || 0;
  const loading = resource.loading, error = resource.error, load = resource.retry;
  useEffect(() => {
    const pending = orders.filter((order) => order.status === "generating" && (order.active_generation_job_id || order.provider_job_id) && !order.song_assets.length);
    if (!pending.length || !user) return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const results = await Promise.all(pending.slice(0, 3).map(async (order) => {
          const response = await fetch("/api/music/status/" + encodeURIComponent(order.active_generation_job_id || order.provider_job_id!) + "?orderId=" + order.id, {cache:"no-store", signal:controller.signal});
          if (!response.ok) return false;
          const data = await response.json();
          return ["completed", "failed", "needs_review"].includes(data.status);
        }));
        if (active && results.some(Boolean)) await load();
      } catch { /* A later poll or manual refresh can recover a temporary outage. */ }
      finally { inFlight = false; }
    }, 8000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [orders, user, load]);
  return <main className="library-page"><AccountHeader /><section className="library-shell"><AccountLinks /><div className="library-heading"><div><p className="section-kicker">Your personal collection</p><h1>My Songs<span className="orange-period">.</span></h1><p>The stories you turned into music, ready whenever you are.</p></div><Link href="/create" className="primary-button">Create a new song <ArrowIcon /></Link></div><div className="library-account"><span><span className="account-dot" aria-hidden="true" />{user?.email || "Loading your account..."}</span></div><div className="library-toolbar"><div className="library-filters" aria-label="Filter songs">{[["all", "All songs"], ["ready", "Ready to play"], ["progress", "In progress"], ["draft", "Drafts"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => { setPage(0); setFilter(key); }}>{label}</button>)}</div><button className="text-button" onClick={() => void load()} disabled={loading}>↻ Refresh</button></div>{error && <div className="form-error" role="alert">{error}<button className="text-button" onClick={() => void load()}>Try again</button></div>}{loading || authLoading ? <div className="library-loading" role="status">Finding your songs…</div> : !orders.length ? <div className="library-empty"><span className="empty-record" aria-hidden="true">♫</span><h2>{filter === "all" ? "Your first memory starts here." : "No songs here yet."}</h2><p>{filter === "all" ? "Create a song for someone special. It will be waiting here when you come back." : "Try another filter, or start something new."}</p><Link className="primary-button" href="/create">Create a song <ArrowIcon /></Link></div> : <div className="song-library-grid">{orders.map((order, index) => {
    const ready = order.song_assets.length > 0;
    const generating = !ready && order.status === "generating";
    const failed = !ready && order.status === "failed";
    const title = order.title || "A song for " + order.recipient_name;
    return <article className="library-song-card" key={order.id}><div className={`library-cover cover-${index % 3}`}><div className="library-record" aria-hidden="true"><span>♪</span></div><span className={`song-status ${ready ? "status-ready" : failed ? "status-failed" : generating ? "status-progress" : "status-draft"}`}>{ready ? "Ready to play" : failed ? "Needs attention" : generating ? "Creating your song" : order.paid_at ? "Paid · Ready to create" : "Lyrics draft"}</span></div><div className="library-card-body"><p className="card-occasion">{order.occasion} <span>·</span> For {order.recipient_name}</p><h2>{title}</h2><p className="card-date">{new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}<span>{order.paid_at ? "Paid" : "Not purchased"}</span></p>{ready && <SongAudio orderId={order.id} label={`Play ${title}`} compact />}<div className="library-card-actions"><Link className="text-link" href={ready || generating || failed ? `/song/${order.id}` : `/lyrics/${order.id}`}>{ready ? "View song" : generating ? "View progress" : failed ? "View details" : "Continue song"} <ArrowIcon /></Link>{ready && <Link className="download-link" href={`/song/${order.id}`}>Play & download</Link>}</div><p className="card-order-number">Order {order.id.slice(0, 8).toUpperCase()} · <Link href={"/account/payments/" + order.id}>Payment record</Link></p></div></article>;
  })}</div>}{!loading && total > 20 && <div className="library-pagination"><button className="text-button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page + 1} of {Math.ceil(total / 20)}</span><button className="text-button" disabled={(page + 1) * 20 >= total} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}<p className="library-footnote">Your songs are private to your account. Download a copy to keep your memories close.</p></section></main>;
}
