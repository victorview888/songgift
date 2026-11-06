"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function OverviewRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className="admin-button admin-button-quiet" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "正在刷新…" : "刷新统计"}</button>;
}
