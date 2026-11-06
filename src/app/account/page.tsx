"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/account-provider";
import { ACCOUNT_CLEARED_EVENT, clearStoryDraft } from "@/lib/drafts/story";

export default function AccountPage() {
  const { user, loading, signOut } = useAccount();
  const [confirmClear, setConfirmClear] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { if (!loading && !user) window.location.replace("/login?next=%2Faccount"); }, [loading, user]);
  function clearDraft() {
    const cleared = clearStoryDraft();
    if (cleared) window.dispatchEvent(new Event(ACCOUNT_CLEARED_EVENT));
    setConfirmClear(false); setMessage(cleared ? "The story draft in this tab has been cleared. Your saved orders and songs are still in My Songs." : "This browser could not clear the draft. You can close this tab to end its local session.");
  }
  if (loading || !user) return <p role="status">Checking your account…</p>;
  return <><p className="section-kicker">Your space</p><h1 className="customer-title">Account</h1><p className="customer-intro">Manage the account you use to save your songs.</p>
    <section className="customer-card"><h2>Sign-in email</h2><p className="account-email">{user.email}</p><p>Email verified · Sign in with an email code.</p><button className="text-button" onClick={() => void signOut().catch(error => setMessage(error.message))}>Log out</button></section>
    <section className="customer-card"><h2>Story draft in this tab</h2><p>Unfinished stories can be restored for up to 24 hours in this tab. Clearing a draft leaves your saved orders and purchased songs in your account.</p>{confirmClear ? <div className="draft-actions"><p>Clear the unfinished story saved in this tab?</p><button className="text-button" onClick={clearDraft}>Yes, clear this draft</button><button className="text-button" onClick={() => setConfirmClear(false)}>Keep draft</button></div> : <button className="text-button" onClick={() => setConfirmClear(true)}>Clear saved story draft</button>}</section>
    {message && <p role="status" className="draft-status">{message}</p>}
    <section className="customer-card"><h2>Orders and help</h2><p>Find recorded payments and order references, or get help with a song.</p><div className="draft-actions"><Link className="text-link" href="/account/payments">Payment history</Link><Link className="text-link" href="/contact">Contact support</Link><Link className="text-link" href="/policies/audio-storage">Keeping your audio</Link></div></section>
  </>;
}
