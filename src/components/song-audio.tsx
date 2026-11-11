"use client";
import Link from "next/link";
import { useRef, useState } from "react";

export function SongAudio({ orderId, label = "Your personalized song", compact = false, onPlaying }: { orderId: string; label?: string; compact?: boolean; onPlaying?: (playing: boolean) => void }) {
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);
  async function download() {
    if (downloadingRef.current) return;
    downloadingRef.current = true; setDownloading(true); setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/audio?download=1`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error("Your download is temporarily unavailable. Please retry or get help with this order.");
      const url = URL.createObjectURL(await response.blob());
      const extensions: Record<string, string> = { "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac", "audio/mp4": "m4a", "audio/mpeg": "mp3" };
      const extension = extensions[response.headers.get("content-type")!.split(";")[0]] || "mp3";
      const link = document.createElement("a"); link.href = url; link.download = `songgift-${orderId.slice(0, 8)}.${extension}`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try your download again."); }
    finally { downloadingRef.current = false; setDownloading(false); }
  }
  return <div className={compact ? "song-audio compact" : "song-audio"}>
    <audio key={revision} aria-label={label} controls preload="none" src={`/api/orders/${orderId}/audio`} onError={() => { onPlaying?.(false); setError("The audio could not be loaded. Try reloading it."); }} onPlay={() => onPlaying?.(true)} onPause={() => onPlaying?.(false)} onEnded={() => onPlaying?.(false)} />
    <div className="audio-actions">{!compact && <button type="button" className="primary-button" disabled={downloading} onClick={() => void download()}>{downloading ? "Preparing download…" : "Download song"}</button>}</div>
    {error && <div className="form-error" role="alert"><p>{error}</p><button type="button" className="text-button" onClick={() => { setError(""); setRevision(value => value + 1); }}>Reload audio</button> · <Link href={`/contact?orderId=${orderId}`}>Get help</Link></div>}
  </div>;
}
