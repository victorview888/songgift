import { NextResponse } from "next/server";
import { advanceDemoBatch } from "@/lib/services/audio-preview";
import { HttpError } from "@/lib/http-error";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    // Scoped to an expiring, Owner-authorized batch of three fixed demos.
    return NextResponse.json(await advanceDemoBatch(request.headers.get("x-songgift-demo-token") || ""), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "Demo processing unavailable." }, { status: error instanceof HttpError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
