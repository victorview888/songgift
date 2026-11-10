"use client";
import { useState } from "react";
export function CopyId({ value, label = "标识" }: { value: string; label?: string }) {
  const [message, setMessage] = useState("");
  return <div className="copy-id"><code>{value}</code><button className="text-button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setMessage("已复制"); } catch { setMessage("请选中标识后手动复制"); } }}>复制{label}</button><span role="status">{message}</span></div>;
}
