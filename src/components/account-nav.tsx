"use client";
import Link from "next/link";
import { useAccount } from "./account-provider";
export function AccountNav() {
  const { user, loading } = useAccount();
  return <nav className="account-nav" aria-label="Your account"><Link href={user ? "/my-songs" : "/login"} aria-busy={loading}>{user ? <><span aria-hidden="true">♫</span> My Songs</> : "Log in"}</Link></nav>;
}
