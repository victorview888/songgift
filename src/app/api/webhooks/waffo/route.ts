import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http-error";
import { handleWaffoWebhook } from "@/lib/payments/waffo";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "A payment notification is required.");
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 65536) { await reader.cancel(); throw new HttpError(413, "Payment notification is too large."); }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const result = await handleWaffoWebhook(raw, request.headers.get("x-waffo-signature") || "");
    // Ack only after the fast database transaction commits. No music, mail or
    // other slow work runs here, so a database failure remains retryable.
    return NextResponse.json({ received: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "Payment notification could not be recorded." }, { status: error instanceof HttpError ? error.status : 503 });
  }
}
