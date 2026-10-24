"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SongPage() {
  const [recipient, setRecipient] = useState("someone special");
  const [playing, setPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Your song is being prepared. This can take a little while.",
  );

  useEffect(() => {
    const savedStory = sessionStorage.getItem("songgift-story");
    const savedResult = sessionStorage.getItem("songgift-result");
    const parsedStory = savedStory
      ? (JSON.parse(savedStory) as { recipientName?: string })
      : {};
    const result = savedResult
      ? (JSON.parse(savedResult) as {
          message?: string;
          audioBase64?: string;
          audioUrl?: string;
          providerJobId?: string;
          status?: string;
        })
      : {};
    const name = parsedStory.recipientName;
    let createdUrl = "";
    let pollTimer: number | undefined;
    let pollInFlight = false;

    const timer = window.setTimeout(() => {
      if (name) setRecipient(name);
      if (result.message) setStatusMessage(result.message);
      if (result.audioUrl) setAudioUrl(result.audioUrl);

      if (result.audioBase64) {
        try {
          const raw = result.audioBase64.includes(",")
            ? result.audioBase64.split(",")[1]
            : result.audioBase64;
          const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            "=",
          );
          const binary = window.atob(padded);
          const bytes = Uint8Array.from(binary, (character) =>
            character.charCodeAt(0),
          );
          createdUrl = URL.createObjectURL(
            new Blob([bytes], { type: "audio/mpeg" }),
          );
          setAudioUrl(createdUrl);
        } catch {
          setStatusMessage(
            "The provider returned audio that could not be decoded in the browser.",
          );
        }
      }

      if (
        result.providerJobId &&
        (result.status === "queued" || result.status === "processing")
      ) {
        pollTimer = window.setInterval(async () => {
          if (pollInFlight) return;
          pollInFlight = true;
          try {
            const orderId = sessionStorage.getItem("songgift-order-id") || "";
            const response = await fetch(
              "/api/music/status/" +
                encodeURIComponent(result.providerJobId || "") +
                "?orderId=" +
                encodeURIComponent(orderId),
            );
            if (!response.ok) return;
            const next = (await response.json()) as {
              audioUrl?: string;
              message?: string;
              status?: string;
            };
          if (next.message) setStatusMessage(next.message);
          if (next.audioUrl) {
            setAudioUrl(next.audioUrl);
            if (pollTimer) window.clearInterval(pollTimer);
          } else if (next.status === "failed") {
            setStatusMessage(next.message || "The music provider could not create this song.");
            if (pollTimer) window.clearInterval(pollTimer);
          } else if (
              next.status === "completed" ||
              next.status === "mock"
            ) {
              if (pollTimer) window.clearInterval(pollTimer);
            }
          } catch {
            // Keep polling while the provider job is still being processed.
          } finally {
            pollInFlight = false;
          }
        }, 5000);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (pollTimer) window.clearInterval(pollTimer);
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, []);

  return (
    <main className="form-page result-page">
      <header className="site-header form-header">
        <Link className="brand-link" href="/" aria-label="SongGift home">
          <span className="brand"><span className="brand-mark" aria-hidden="true">♪</span>songgift</span>
        </Link>
        <span className="form-progress">Step 3 of 3</span>
      </header>
      <section className="result-shell">
        <div className={playing ? "result-record is-playing" : "result-record"}>
          <div className="record-label">♪</div>
        </div>
        <div className="result-copy">
          <p className="section-kicker">Your song is ready</p>
          <h1>For {recipient}, with all your heart.</h1>
          <p>This song was made from the story you shared. Press play when you are ready to hear it.</p>
          {audioUrl ? (
            <audio className="audio-player" controls src={audioUrl}>
              Your browser does not support audio playback.
            </audio>
          ) : (
            <div className="player-card">
              <button className="play-button" type="button" onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause preview" : "Play preview"}>
                {playing ? "Ⅱ" : "▶"}
              </button>
              <div className="player-info">
                <strong>A song made just for {recipient}</strong>
                <div className="player-track"><span className={playing ? "track-progress active" : "track-progress"} /></div>
                <div className="player-time"><span>{playing ? "0:18" : "0:00"}</span><span>2:42</span></div>
              </div>
            </div>
          )}
          <div className="result-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!audioUrl}
              onClick={() => {
                if (audioUrl) window.open(audioUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Download song <span aria-hidden="true">↓</span>
            </button>
            <Link className="text-link" href="/create">Create another song</Link>
          </div>
          <p className="result-note">{statusMessage}</p>
        </div>
      </section>
    </main>
  );
}
