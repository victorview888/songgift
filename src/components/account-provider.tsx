"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ACCOUNT_CLEARED_EVENT, clearStoryDraft } from "@/lib/drafts/story";
import type { AccountUser } from "@/lib/types/account";

const AccountContext = createContext<{ user: AccountUser | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }>({ user: null, loading: true, refresh: async () => {}, signOut: async () => {} });
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const refreshVersion = useRef(0);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json();
      if (version === refreshVersion.current) setUser(response.ok ? data.user : null);
    } catch { if (version === refreshVersion.current) setUser(null); }
    finally { if (version === refreshVersion.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!response.ok) throw new Error("We couldn't sign you out. Please try again.");
    refreshVersion.current++;
    clearStoryDraft();
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith("songgift-")) sessionStorage.removeItem(key); } catch {}
    window.dispatchEvent(new Event(ACCOUNT_CLEARED_EVENT));
    // Reset private page state as well as the session; avoid competing login redirects.
    window.location.replace("/");
  }, []);
  return <AccountContext.Provider value={{ user, loading, refresh, signOut }}>{children}</AccountContext.Provider>;
}
