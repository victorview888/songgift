import { NextResponse } from "next/server";
import { authRoute, claimLegacyOrders, HttpError, safeNext, validEmail } from "@/lib/auth/server";

export async function POST(request: Request) {
  return authRoute(request, async ({ supabase }) => {
    const body = await request.json();
    const email = validEmail(body.email);
    const token = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || !/^\d{6,10}$/.test(token)) throw new HttpError(400, "Enter the code from your email.");
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.user?.email_confirmed_at) throw new HttpError(error?.status === 429 ? 429 : 400, "That code is invalid or has expired. Please request a new one.");
    await claimLegacyOrders(supabase);
    return NextResponse.json({ user: { id: data.user.id, email: data.user.email }, next: safeNext(body.next) });
  }, false);
}
