"use client";
import { useState } from "react";
export function GiftAudio({ token, title }: { token: string; title: string }) {
  const [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  return (
    <>
      <audio
        key={revision}
        controls
        preload="none"
        src={"/api/gifts/" + token + "/audio"}
        aria-label={"Play " + title}
        onError={() => setError(true)}
      />
      {error && (
        <div role="alert">
          <p>
            We could not load this song. Try again, or ask the sender whether
            the gift link is still active.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setError(false);
              setRevision((n) => n + 1);
            }}
          >
            Try audio again
          </button>
        </div>
      )}
    </>
  );
}
