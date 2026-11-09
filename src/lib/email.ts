import "server-only";

export class MailDeliveryError extends Error {
  constructor(public code: "temporary" | "provider_rejected" | "provider_conflict", public retryable: boolean) { super("Song notification delivery failed."); }
}
export function notificationConfig() {
  const from = process.env.SONGGIFT_FROM_EMAIL?.trim();
  if (!process.env.RESEND_API_KEY || !from || from.length > 254 || /[\r\n]/.test(from)) return null;
  try {
    const url = new URL(process.env.SONGGIFT_SITE_URL || "https://www.songforalways.com");
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { from, siteOrigin: url.origin };
  } catch { return null; }
}
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}
export async function sendSongReadyEmail(input: { to: string; recipientName: string; songUrl: string; from: string; idempotencyKey: string }) {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from: input.from, to: [input.to], subject: "Your SongGift song is ready",
        text: "Your song for " + input.recipientName + " is ready. Sign in to listen or download: " + input.songUrl,
        html: "<p>Your song for <strong>" + escapeHtml(input.recipientName) + "</strong> is ready.</p><p><a href=\"" + escapeHtml(input.songUrl) + "\">Sign in to listen or download your song</a></p>" }),
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new MailDeliveryError("temporary", true); }
  if (!response.ok) {
    if (response.status === 409) throw new MailDeliveryError("provider_conflict", false);
    if (response.status === 429 || response.status >= 500) throw new MailDeliveryError("temporary", true);
    throw new MailDeliveryError("provider_rejected", false);
  }
  try {
    const data = await response.json();
    if (typeof data.id === "string" && data.id.length > 0 && data.id.length <= 256) return data.id as string;
  } catch {}
  throw new MailDeliveryError("temporary", true);
}
