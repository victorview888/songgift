"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "./account-provider";

export function usePrivateResource<T>(path: string, next: string) {
  const { user, loading } = useAccount();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ owner: string; path: string; data: T | null; error: string; busy: boolean } | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!user) { window.location.replace("/login?next=" + encodeURIComponent(next)); return; }
    const controller = new AbortController(), owner = user.id;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState({ owner, path, data: null, error: "", busy: true });
      try {
        const response = await fetch(path, { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) { window.location.replace("/login?next=" + encodeURIComponent(next)); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Your records are temporarily unavailable.");
        if (!controller.signal.aborted) setState({ owner, path, data, error: "", busy: false });
      } catch (error) {
        if (!controller.signal.aborted) setState({ owner, path, data: null, error: error instanceof Error ? error.message : "Please try again.", busy: false });
      }
    });
    return () => controller.abort();
  }, [loading, user, path, next, revision]);
  const current = user && state?.owner === user.id && state.path === path ? state : null;
  const retry = useCallback(() => setRevision(value => value + 1), []);
  return { data: current?.data, error: current?.error, loading: loading || !current || current.busy, retry };
}
