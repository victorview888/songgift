"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AccountHeader } from "@/components/account-header";
import { useAccount } from "@/components/account-provider";
import type { AccountOrder } from "@/lib/types/account";

export default function LyricsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAccount();
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [checkoutPrice, setCheckoutPrice] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [savedLyrics, setSavedLyrics] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const captureStarted = useRef(false);
  const generate = useCallback(async () => {
    const response = await fetch("/api/music", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "We couldn't start your song. Your order is saved.");
    router.push("/song/" + id);
  }, [id, router]);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { window.location.replace("/login?next=" + encodeURIComponent("/lyrics/" + id + window.location.search)); return; }
    if (id === "demo") { window.location.replace("/my-songs"); return; }
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/orders/" + id, { cache: "no-store" });
        if (response.status === 401) { window.location.replace("/login?next=" + encodeURIComponent("/lyrics/" + id)); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "We couldn't load your lyrics.");
        if (!active) return;
        const current = data.order as AccountOrder;
        if (current.song_assets.length || current.status === "generating") { router.replace("/song/" + id); return; }
        setOrder(current); setLyrics(current.lyrics_text || ""); setSavedLyrics(current.lyrics_text || "");
        if (data.checkoutPrice?.currencyCode && data.checkoutPrice?.value) {
          setCheckoutPrice(new Intl.NumberFormat("en-US", { style: "currency", currency: data.checkoutPrice.currencyCode }).format(Number(data.checkoutPrice.value)));
        }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Please try again."); }
    })();
    return () => { active = false; };
  }, [id, user, authLoading, router]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!order || !token || captureStarted.current) return;
    captureStarted.current = true;
    setBusy(true); setMessage("Confirming your payment…");
    void (async () => {
      try {
        const response = await fetch("/api/paypal/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paypalOrderId: token }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "We couldn't confirm the payment.");
        if (data.orderId !== id) throw new Error("This payment belongs to a different song.");
        window.history.replaceState({}, "", "/lyrics/" + id);
        setMessage("Payment confirmed. Starting your song…"); await generate();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); setBusy(false); setMessage(""); }
    })();
  }, [order, id, generate]);
  async function save() {
    const response = await fetch("/api/orders/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lyricsText: lyrics }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "We couldn't save your lyrics.");
    setSavedLyrics(lyrics); setMessage("Your lyrics are saved to your account.");
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(order?.paid_at ? "Starting your song…" : "Opening secure PayPal checkout…");
    try {
      await save();
      if (order?.paid_at) { await generate(); return; }
      const response = await fetch("/api/paypal/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "We couldn't open checkout.");
      if (data.alreadyPaid) { await generate(); return; }
      if (!data.approvalUrl) throw new Error("Checkout is temporarily unavailable.");
      window.location.assign(data.approvalUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); setBusy(false); setMessage(""); }
  }
  return <main className="form-page"><AccountHeader step="Step 2 of 3" /><section className="form-shell lyrics-shell"><div className="form-intro"><p className="section-kicker">Your personal lyrics</p><h1>{order ? `A song for ${order.recipient_name} starts here.` : "Finding your lyrics…"}</h1><p>Read through the lyrics and make any changes you like. Your story is saved to your account.</p></div>{order && <form className="story-form lyrics-form" onSubmit={submit}><div className="lyrics-toolbar"><span>{order.title || "Your song"}</span><small>{lyrics === savedLyrics ? "Saved to your account" : "Unsaved changes"}</small></div><textarea className="lyrics-editor" aria-label="Song lyrics" value={lyrics} maxLength={12000} minLength={20} required disabled={busy} onChange={(event) => setLyrics(event.target.value)} /><div className="form-submit-row"><button className="text-button" type="button" disabled={busy || lyrics === savedLyrics} onClick={async () => { setBusy(true); setError(""); try { await save(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); } finally { setBusy(false); } }}>Save lyrics</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : order.paid_at ? "Create my song" : checkoutPrice ? `Pay ${checkoutPrice} · Create song` : "Pay and create song"}<span aria-hidden="true">↗</span></button></div></form>}{message && <p className="form-note" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<Link className="text-link back-to-library" href="/my-songs">← My Songs</Link></section></main>;
}
