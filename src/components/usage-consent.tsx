"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  getChoice,
  stopUsage,
  hasUsageSession,
  setUsageChoice,
  refreshContext,
  trackUsage,
  withdrawUsage,
} from "@/lib/growth/usage-client";
import { usagePage } from "@/lib/growth/usage";
const subscribe = (listener: () => void) => {
  window.addEventListener("songgift:consent", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("songgift:consent", listener);
    window.removeEventListener("storage", listener);
  };
};
export function UsageConsent({ campaigns }: { campaigns: string[] }) {
  const choice = useSyncExternalStore(subscribe, getChoice, () => "server"),
    path = usePathname();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  useEffect(() => {
    if (choice === "allow" && usagePage(path)) {
      refreshContext(campaigns);
      void trackUsage("page_view");
    }
  }, [path, choice, campaigns]);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("songgift:preferences", show);
    return () => window.removeEventListener("songgift:preferences", show);
  }, []);
  async function choose(allow: boolean) {
    setPending(true);
    setError("");
    try {
      if (!allow) {
        stopUsage();
        if (hasUsageSession()) await withdrawUsage();
      }
      setUsageChoice(allow, campaigns);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  if (path.startsWith("/admin") || path.startsWith("/gift/")) return null;
  if (!open && (choice !== "" || !usagePage(path))) return null;
  return (
    <section className="usage-consent" aria-label="Optional usage analytics">
      <div>
        <h2>Help us improve SongGift?</h2>
        <p>
          Optional first-party analytics records a random browser ID, broad
          traffic sources and song-making steps within a 30-day reporting
          window. We do not record stories, lyrics, names or email addresses in
          analytics. <Link href="/policies/privacy">Privacy details</Link>
        </p>
      </div>
      <div className="draft-actions">
        <button
          className="primary-button"
          disabled={pending}
          onClick={() => void choose(true)}
        >
          Allow analytics
        </button>
        <button
          className="text-button"
          disabled={pending}
          onClick={() => void choose(false)}
        >
          No thanks
        </button>
        {open && (
          <button className="text-button" onClick={() => setOpen(false)}>
            Close
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
