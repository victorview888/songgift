"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccountHeader } from "@/components/account-header";
import { useAccount } from "@/components/account-provider";
import type { AccountOrder } from "@/lib/types/account";

export default function MySongsPage() {
  const { user, loading: authLoading, signOut } = useAccount();
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/orders?page=${page}&filter=${filter}`, { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/login?next=/my-songs"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We couldn't load your songs.");
      setOrders(data.orders); setTotal(data.total);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); }
    finally { setLoading(false); }
  }, [user, page, filter]);
  useEffect(() => { if (!authLoading && !user) window.location.replace("/login?next=/my-songs"); }, [user, authLoading]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    const pending = orders.filter((order) => order.status === "generating" && order.provider_job_id && !order.song_assets.length);
    if (!pending.length || !user) return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const results = await Promise.all(pending.slice(0, 3).map(async (order) => {
          const response = await fetch("/api/music/status/" + encodeURIComponent(order.provider_job_id!) + "?orderId=" + order.id, {cache:"no-store", signal:controller.signal});
          if (!response.ok) return false;
          const data = await response.json();
          return data.status === "completed" || data.status === "failed";
        }));
        if (active && results.some(Boolean)) await load();
      } catch { /* A later poll or manual refresh can recover a temporary outage. */ }
      finally { inFlight = false; }
    }, 8000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [orders, user, load]);
  return <main className="library-page"><AccountHeader /><section className="library-shell"><div className="library-heading"><div><p className="section-kicker">Your personal collection</p><h1>My Songs<span className="orange-period">.</span></h1><p>The stories you turned into music, ready whenever you are.</p></div><Link href="/create" className="primary-button">Create a new song <span aria-hidden="true">↗</span></Link></div><div className="library-account"><span><span className="account-dot" aria-hidden="true" />{user?.email || "Loading your account..."}</span><button className="text-button" onClick={() => void signOut().catch((caught) => setError(caught.message))}>Log out</button></div><div className="library-toolbar"><div className="library-filters" aria-label="Filter songs">{[["all", "All songs"], ["ready", "Ready to play"], ["progress", "In progress"], ["draft", "Drafts"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => { setPage(0); setFilter(key); }}>{label}</button>)}</div><button className="text-button" onClick={() => void load()} disabled={loading}>↻ Refresh</button></div>{error && <div className="form-error" role="alert">{error}<button className="text-button" onClick={() => void load()}>Try again</button></div>}{loading || authLoading ? <div className="library-loading" role="status">Finding your songs…</div> : !orders.length ? <div className="library-empty"><span className="empty-record" aria-hidden="true">♫</span><h2>{filter === "all" ? "Your first memory starts here." : "No songs here yet."}</h2><p>{filter === "all" ? "Create a song for someone special. It will be waiting here when you come back." : "Try another filter, or start something new."}</p><Link className="primary-button" href="/create">Create a song <span aria-hidden="true">↗</span></Link></div> : <div className="song-library-grid">{orders.map((order, index) => {
    const ready = order.song_assets.length > 0;
    const generating = !ready && order.status === "generating";
    const failed = !ready && order.status === "failed";
    const title = order.title || "A song for " + order.recipient_name;
    return <article className="library-song-card" key={order.id}><div className={`library-cover cover-${index % 3}`}><div className="library-record" aria-hidden="true"><span>♪</span></div><span className={`song-status ${ready ? "status-ready" : failed ? "status-failed" : generating ? "status-progress" : "status-draft"}`}>{ready ? "Ready to play" : failed ? "Needs attention" : generating ? "Creating your song" : order.paid_at ? "Paid · Ready to create" : "Lyrics draft"}</span></div><div className="library-card-body"><p className="card-occasion">{order.occasion} <span>·</span> For {order.recipient_name}</p><h2>{title}</h2><p className="card-date">{new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}<span>{order.paid_at ? "Paid" : "Not purchased"}</span></p>{ready && <audio aria-label={`Play ${title}`} controls preload="none" src={`/api/orders/${order.id}/audio`} />}<div className="library-card-actions"><Link className="text-link" href={ready || generating || failed ? `/song/${order.id}` : `/lyrics/${order.id}`}>{ready ? "View song" : generating ? "View progress" : failed ? "View details" : "Continue song"} <span aria-hidden="true">↗</span></Link>{ready && <a className="download-link" href={`/api/orders/${order.id}/audio?download=1`}>Download <span aria-hidden="true">↓</span></a>}</div><p className="card-order-number">Order {order.id.slice(0, 8).toUpperCase()}</p></div></article>;
  })}</div>}{!loading && total > 20 && <div className="library-pagination"><button className="text-button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page + 1} of {Math.ceil(total / 20)}</span><button className="text-button" disabled={(page + 1) * 20 >= total} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}<p className="library-footnote">Your songs are private to your account. Download a copy to keep your memories close.</p></section></main>;
}
