import type { MusicGenerationResult } from "@/lib/types/song";

export async function sendSongReadyEmail(input: {
  email: string;
  recipientName: string;
  audioUrl: string;
  result: MusicGenerationResult;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SONGGIFT_FROM_EMAIL;
  if (!apiKey || !from) return { status: "skipped" as const, reason: "email_not_configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Your SongGift song is ready",
      html:
        "<p>Your song for <strong>" + escapeHtml(input.recipientName) + "</strong> is ready.</p>" +
        "<p><a href=\"" + escapeHtml(input.audioUrl) + "\">Listen to or download your song</a></p>" +
        "<p>This link is temporary. Download the audio to keep it.</p>",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Email delivery failed (HTTP " + response.status + ").");
  return { status: "sent" as const };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
