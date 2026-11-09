import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/lib/http-error";
export { HttpError } from "@/lib/http-error";

export { safeNext } from "./redirect";

export type AuthContext = { supabase: SupabaseClient; user: User | null };

// A fresh client and cookie store for every request prevents session leakage
// between visitors in a long-lived Worker isolate. Tokens never enter JS storage.
export async function authRoute(
  request: Request,
  handler: (context: AuthContext) => Promise<Response>,
  requireLogin = true,
) {
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  let response: Response;
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
        throw new HttpError(403, "Please submit this request from the SongGift website.");
      }
      if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "A JSON request is required.");
    }
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new HttpError(503, "Account sign-in is temporarily unavailable. Please try again later.");
    const jar = new Map(new NextRequest(request.url, { headers: request.headers }).cookies.getAll().map(({ name, value }) => [name, value]));
    const supabase = createServerClient(url, key, {
      cookieOptions: { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/" },
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => { for (const cookie of cookies) { jar.set(cookie.name, cookie.value); pending.set(cookie.name, cookie); } },
      },
    });
    let user: User | null = null;
    if (requireLogin) {
      const result = await supabase.auth.getUser();
      user = result.data.user;
      if (result.error || !user || !user.email_confirmed_at) throw new HttpError(401, "Please sign in to access your songs.");
    }
    response = await handler({ supabase, user });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error instanceof SyntaxError ? 400 : 500;
    response = NextResponse.json({ error: error instanceof HttpError ? error.message : status === 400 ? "Please check the request and try again." : "We couldn't complete this request. Please try again." }, { status });
    if (status === 500) console.error("SongGift account request failed:", error instanceof Error ? error.message : "Unknown error");
  }
  const output = new NextResponse(response.body, { status: response.status, headers: response.headers });
  output.headers.set("Cache-Control", "private, no-store, max-age=0");
  output.headers.set("Pragma", "no-cache");
  output.headers.set("Expires", "0");
  output.headers.set("Vary", "Cookie");
  for (const { name, value, options } of pending.values()) output.cookies.set(name, value, { ...options, httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/" });
  return output;
}

export async function claimLegacyOrders(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("claim_my_songgift_orders");
  if (error) throw new Error("Could not associate verified historical orders: " + error.message);
}

export function validEmail(value: unknown) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
