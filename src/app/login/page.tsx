"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AccountHeader } from "@/components/account-header";
import { useAccount } from "@/components/account-provider";
import { safeNext } from "@/lib/auth/redirect";

export default function LoginPage() {
  const { user, loading, refresh } = useAccount();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [nextPath, setNextPath] = useState("/my-songs");
  useEffect(() => {
    void Promise.resolve().then(() => setNextPath(safeNext(new URLSearchParams(window.location.search).get("next"))));
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  async function sendCode() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, next: new URLSearchParams(window.location.search).get("next") }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We couldn't send your code. Please try again.");
      setSent(true); setCooldown(60);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) return sendCode();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, next: new URLSearchParams(window.location.search).get("next") }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We couldn't verify that code.");
      await refresh(); window.location.assign(payload.next || "/my-songs");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); setBusy(false); }
  }
  return <main className="form-page"><AccountHeader /><section className="account-auth-shell"><div className="account-auth-art" aria-hidden="true"><div className="library-record"><span>♪</span></div><p>Every song.<br /><em>Always yours.</em></p><small>A little place for the moments that matter.</small></div><div className="account-auth-card"><p className="section-kicker">Welcome to your collection</p><h1>{sent ? "Check your inbox." : "Your songs, all in one place."}</h1><p>{sent ? <>We sent sign-in instructions to <strong>{email}</strong>. Use the sign-in link, or enter the code if your email includes one.</> : "Sign in to find your songs, revisit your stories, and download a gift worth keeping."}</p>{!loading && user ? <div className="already-signed-in"><p>You are signed in as {user.email}.</p><Link href={nextPath} className="primary-button">{nextPath.startsWith("/admin") ? "Continue to admin" : "Go to My Songs"} <span aria-hidden="true">↗</span></Link></div> : <form onSubmit={submit} className="login-form"><label><span>Email address</span><input type="email" autoComplete="email" value={email} readOnly={sent} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254} /></label>{sent && <label><span>Sign-in code</span><input aria-label="Sign-in code" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="Enter your code" required autoFocus /></label>}<button type="submit" className="primary-button" disabled={busy || loading}>{busy ? "Please wait..." : sent ? "Verify and sign in" : "Send sign-in code"}<span aria-hidden="true">↗</span></button>{error && <p role="alert" className="form-error">{error}</p>}{sent ? <div className="auth-small-actions"><button type="button" className="text-button" disabled={busy || cooldown > 0} onClick={sendCode}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button><button type="button" className="text-button" onClick={() => { setSent(false); setCode(""); setError(""); }}>Use another email</button></div> : <><button type="button" className="text-button existing-code-button" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)} onClick={() => { setSent(true); setError(""); }}>I already have a code</button><p className="auth-small-print">No password to remember. New here? Verifying your email creates your account.</p></>}</form>}<Link href="/" className="text-link auth-back">← Back to SongGift</Link></div></section></main>;
}
