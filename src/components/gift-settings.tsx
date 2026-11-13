"use client";
import { useState } from "react";
import { usePrivateResource } from "./use-private-resource";
type Gift = { active: boolean; url: string | null; greeting: string };
export function GiftSettings({ orderId }: { orderId: string }) {
  const resource = usePrivateResource<Gift>(
    "/api/orders/" + orderId + "/gift",
    "/song/" + orderId,
  );
  const [greeting, setGreeting] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function change(active: boolean) {
    setPending(true);
    setMessage("");
    try {
      const r = await fetch("/api/orders/" + orderId + "/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active,
          greeting: greeting ?? resource.data?.greeting ?? "",
          confirmed,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Please try again.");
      await resource.retry();
      setMessage(
        active
          ? "Gift link created. Previous links have been replaced."
          : "Sharing has been turned off.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="gift-settings">
      <h2>Give this song to someone special.</h2>
      <p>
        Sharing is off until you create a link. Anyone who has it can listen.
        Your original story and payment details stay private.
      </p>
      {resource.error && (
        <p role="alert">
          {resource.error}{" "}
          <button className="text-button" onClick={() => void resource.retry()}>
            Retry
          </button>
        </p>
      )}
      {resource.loading ? (
        <p role="status">Loading sharing settings…</p>
      ) : (
        resource.data && (
          <>
            <label>
              A short greeting (optional)
              <textarea
                maxLength={300}
                rows={3}
                value={greeting ?? resource.data.greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Something you want them to know…"
              />
            </label>
            <label className="gift-permission">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I have permission to share this song and the recipient’s name.
            </label>
            <div className="draft-actions">
              <button
                className="primary-button"
                disabled={pending || !confirmed}
                onClick={() => void change(true)}
              >
                {pending
                  ? "Saving…"
                  : resource.data.active
                    ? "Create a new gift link"
                    : "Create gift link"}
              </button>
              {resource.data.active && (
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() => void change(false)}
                >
                  Turn off sharing
                </button>
              )}
            </div>
            {resource.data.active && resource.data.url && (
              <div className="gift-link">
                <label>
                  Your active gift link
                  <input
                    readOnly
                    value={new URL(
                      resource.data.url,
                      typeof window === "undefined"
                        ? "https://www.songforalways.com"
                        : window.location.origin,
                    ).toString()}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        new URL(
                          resource.data!.url!,
                          window.location.origin,
                        ).toString(),
                      );
                      setMessage("Gift link copied.");
                    } catch {
                      setMessage(
                        "Copy is unavailable. Select and copy the link above.",
                      );
                    }
                  }}
                >
                  Copy link
                </button>
                <a href={resource.data.url} target="_blank" rel="noreferrer">
                  Preview gift ↗
                </a>
              </div>
            )}
            <p className="gift-hint">
              Creating a new link replaces the old one. Turning sharing off
              blocks new playback requests; audio already buffered or saved
              cannot be recalled.
            </p>
          </>
        )
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
