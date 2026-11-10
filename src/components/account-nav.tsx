"use client";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "./account-provider";
export function AccountNav() {
  const { user, loading, signOut } = useAccount();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  async function logOut() {
    if (signingOut) return;
    setSigningOut(true); setError("");
    try { await signOut(); }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't sign you out. Please try again.");
      setSigningOut(false);
    }
  }
  return <nav className="account-nav" aria-label="Your account">
    <Link href={user ? "/my-songs" : "/login"} aria-busy={loading}>{user ? <><span aria-hidden="true">♫</span> My Songs</> : "Log in"}</Link>
    {user && <button className="account-nav-button" type="button" disabled={signingOut} onClick={() => void logOut()}>{signingOut ? "Logging out…" : "Log out"}</button>}
    {error && <span className="account-nav-error" role="alert">{error}</span>}
  </nav>;
}
