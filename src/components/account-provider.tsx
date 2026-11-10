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
  const [sessionError, setSessionError] = useState("");
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok && response.status !== 401) throw new Error("Session check unavailable");
      if (version === refreshVersion.current) {
        const next = response.status === 401 ? null : data.user;
        setUser(previous => previous?.id === next?.id && previous?.email === next?.email ? previous : next);
        setSessionError(""); setLoading(false);
      }
    } catch { if (version === refreshVersion.current) setSessionError("We couldn't check your connection. Your work is still here."); }
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
  return <AccountContext.Provider value={{ user, loading, refresh, signOut }}>{sessionError && <div className="connection-note" role="status">{sessionError} <button className="text-button" onClick={() => void refresh()}>Retry connection</button></div>}{children}</AccountContext.Provider>;
}
