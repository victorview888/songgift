import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { paymentMethods } from "@/lib/payments/methods";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return authRoute(request, async () => NextResponse.json({ methods: paymentMethods() }));
}
