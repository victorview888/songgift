"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AccountUser } from "@/lib/types/account";

const AccountContext = createContext<{ user: AccountUser | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }>({ user: null, loading: true, refresh: async () => {}, signOut: async () => {} });
export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json();
      setUser(response.ok ? data.user : null);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!response.ok) throw new Error("We couldn't sign you out. Please try again.");
    for (const key of Object.keys(sessionStorage)) if (key.startsWith("songgift-")) sessionStorage.removeItem(key);
    setUser(null);
    router.replace("/");
    router.refresh();
  }, [router]);
  return <AccountContext.Provider value={{ user, loading, refresh, signOut }}>{children}</AccountContext.Provider>;
}
