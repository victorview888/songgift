import { NextResponse } from "next/server";
import { capturePayPalOrder } from "@/lib/paypal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { paypalOrderId?: unknown };
    const paypalOrderId = typeof body.paypalOrderId === "string" ? body.paypalOrderId.trim() : "";
    if (!paypalOrderId) return NextResponse.json({ error: "A PayPal order is required." }, { status: 400 });
    return NextResponse.json(await capturePayPalOrder(paypalOrderId));
  } catch (error) {
    const status = error instanceof Error && error.name === "ProviderConfigurationError" ? 503 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "PayPal payment could not be captured." }, { status });
  }
}
