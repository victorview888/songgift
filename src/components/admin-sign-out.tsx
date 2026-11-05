"use client";

import { useState } from "react";
import { useAccount } from "./account-provider";

export function AdminSignOut() {
  const { signOut } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function leave() {
    setBusy(true);
    setError("");
    try {
      await signOut();
    } catch {
      setError("退出失败，请重试。");
      setBusy(false);
    }
  }

  return <div className="admin-sign-out"><button type="button" className="admin-button admin-button-quiet" disabled={busy} onClick={leave}>{busy ? "正在退出…" : "退出登录"}</button>{error && <p role="alert">{error}</p>}</div>;
}
