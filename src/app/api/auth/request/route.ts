import { NextResponse } from "next/server";
import { authRoute, HttpError, safeNext, validEmail } from "@/lib/auth/server";

export async function POST(request: Request) {
  return authRoute(request, async ({ supabase }) => {
    const body = await request.json();
    const email = validEmail(body.email);
    if (!email) throw new HttpError(400, "Please enter a valid email address.");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: new URL("/auth/callback", request.url).toString() } });
    if (error) {
      if (error.status === 429 || error.code === "over_email_send_rate_limit") throw new HttpError(429, "Please wait a minute before requesting another code.");
      console.error("Email sign-in delivery failed:", error.code || error.status);
      throw new HttpError(503, "We couldn't send a sign-in code right now. Please try again later.");
    }
    const response = NextResponse.json({ message: "Check your email for your sign-in code or link." });
    response.cookies.set("sg-auth-next", safeNext(body.next), { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 1800 });
    return response;
  }, false);
}
