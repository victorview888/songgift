"use client";
import { ArrowIcon } from "@/components/arrow-icon";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AccountHeader } from "@/components/account-header";
import { TermsConfirmation } from "@/components/terms-confirmation";
import { useAccount } from "@/components/account-provider";
import type { AccountOrder } from "@/lib/types/account";

export default function LyricsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAccount();
  return <LyricsEditor key={`${user?.id || "visitor"}:${id}`} />;
}

function LyricsEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAccount();
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [checkoutPrice, setCheckoutPrice] = useState("");
  const [checkoutCurrency, setCheckoutCurrency] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [savedLyrics, setSavedLyrics] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const captureStarted = useRef(false);
  const draftKey = `songgift-lyrics:${user?.id || "visitor"}:${id}`;
  const dirty = lyrics !== savedLyrics;
  useEffect(() => {
    if (!dirty || busy) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a");
      if (!link || link.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const url = new URL(link.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm("You have unsaved lyrics. Leave without saving?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, busy]);
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
        const serverLyrics = current.lyrics_text || "";
        let restored = serverLyrics;
        try {
          const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
          if (draft && draft.base === serverLyrics && typeof draft.text === "string" && draft.text.length <= 12000 && typeof draft.at === "number" && Date.now() - draft.at >= 0 && Date.now() - draft.at < 86400000) restored = draft.text;
          else sessionStorage.removeItem(draftKey);
        } catch { /* Browser draft storage is optional; server lyrics remain available. */ }
        setOrder(current); setLyrics(restored); setSavedLyrics(serverLyrics);
        let price = data.checkoutPrice;
        if (!current.paid_at && !price) {
          const quoted = await fetch("/api/paypal/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
          const payload = await quoted.json();
          if (!quoted.ok) throw new Error(payload.error || "Checkout is temporarily unavailable.");
          price = payload.checkoutPrice;
        }
        if (active && price?.currencyCode && price?.value) {
          setCheckoutCurrency(price.currencyCode);
          setCheckoutPrice(new Intl.NumberFormat("en-US", { style: "currency", currency: price.currencyCode }).format(Number(price.value)));
        }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Please try again."); }
    })();
    return () => { active = false; };
  }, [id, user, authLoading, router, draftKey]);
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
        setOrder(current => current ? { ...current, paid_at: new Date().toISOString() } : current);
        setMessage("Payment confirmed. Starting your song…"); await generate();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); setBusy(false); setMessage(""); }
    })();
  }, [order, id, generate]);
  async function save() {
    const response = await fetch("/api/orders/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lyricsText: lyrics }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "We couldn't save your lyrics.");
    setSavedLyrics(lyrics);
    try { sessionStorage.removeItem(draftKey); } catch {}
  }
  async function saveLyrics() {
    if (busy) return;
    setBusy(true); setSaveStatus("saving"); setError(""); setMessage("");
    try { await save(); setSaveStatus("saved"); }
    catch (caught) { setSaveStatus("idle"); setError(caught instanceof Error ? caught.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setSaveStatus("idle"); setError(""); setMessage(order?.paid_at ? "Starting your song…" : "Opening secure PayPal checkout…");
    try {
      await save();
      if (order?.paid_at) { await generate(); return; }
      const response = await fetch("/api/paypal/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "We couldn't open checkout.");
      if (data.alreadyPaid) { setOrder(current => current ? { ...current, paid_at: new Date().toISOString() } : current); await generate(); return; }
      if (!data.approvalUrl) throw new Error("Checkout is temporarily unavailable.");
      window.location.assign(data.approvalUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); setBusy(false); setMessage(""); }
  }
  return <main className="form-page"><AccountHeader step="Step 2 of 3" /><section className="form-shell lyrics-shell"><div className="form-intro"><p className="section-kicker">Your personal lyrics</p><h1>{order ? `Your song for ${order.recipient_name}.` : "Finding your lyrics…"}</h1><p>Read through the lyrics and make any changes you like. Your story is saved to your account.</p></div>{order && <form className="story-form lyrics-form" onSubmit={submit}><div className="lyrics-edit-panel"><div className="lyrics-toolbar"><span>{order.title || "Your song"}</span><small>{lyrics === savedLyrics ? "Saved to your account" : "Unsaved changes"}</small></div><textarea className="lyrics-editor" aria-label="Song lyrics" value={lyrics} maxLength={12000} minLength={20} required disabled={busy} onChange={(event) => { const text = event.target.value; setLyrics(text); setSaveStatus("idle"); try { if (text === savedLyrics) sessionStorage.removeItem(draftKey); else sessionStorage.setItem(draftKey, JSON.stringify({ base: savedLyrics, text, at: Date.now() })); } catch {} }} /><div className="lyrics-save-actions"><button className="text-button" type="button" disabled={busy || lyrics === savedLyrics} onClick={() => void saveLyrics()}>{saveStatus === "saving" ? "Saving…" : "Save lyrics"}</button><p className="lyrics-save-feedback" data-state={saveStatus} role="status" aria-live="polite" aria-atomic="true">{saveStatus === "saved" ? <><span aria-hidden="true">✓</span> Lyrics saved successfully.</> : saveStatus === "saving" ? "Saving your lyrics…" : ""}</p></div></div><aside className="checkout-summary" aria-label="Order summary"><p className="section-kicker">Your personal song</p><h2>{order.paid_at ? "Payment confirmed" : checkoutPrice || "Checking your quote…"}</h2><p>{order.paid_at ? "Your payment is recorded. Continue to create your song." : "One song. One payment. No subscription."}</p><ul><li>Your personal lyrics</li><li>One AI-generated vocal song</li><li>Playback and audio download</li></ul><p className="checkout-detail">For {order.recipient_name} · {order.occasion}</p><Link href="/pricing" target="_blank" rel="noopener" className="text-link">What is included?</Link>{!order.paid_at && <p className="checkout-detail">PayPal · Charged in {checkoutCurrency || "the quoted currency"}</p>}{!order.paid_at && <TermsConfirmation disabled={busy} payment />}<div className="form-submit-row"><button className="primary-button" type="submit" disabled={busy || (!order.paid_at && !checkoutPrice)}>{busy && saveStatus !== "saving" ? "Please wait…" : order.paid_at ? "Create my song" : checkoutPrice ? `Pay ${checkoutPrice} · Create song` : "Pay and create song"}<ArrowIcon /></button></div></aside></form>}{message && <p className="form-note" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<p className="legal-notice"><Link className="text-link" href="/pricing">Pricing and included services</Link> · <Link className="text-link" href={"/report?reference=" + id}>Report content / appeal</Link></p><Link className="text-link back-to-library" href="/my-songs">← My Songs</Link></section></main>;
}
