import { NextRequest, NextResponse } from "next/server";
import { authRoute, claimLegacyOrders, safeNext } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return authRoute(request, async ({ supabase }) => {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) return NextResponse.redirect(new URL("/login", request.url), 303);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email_confirmed_at) return NextResponse.redirect(new URL("/login", request.url), 303);
    await claimLegacyOrders(supabase);
    const next = safeNext(new NextRequest(request.url, { headers: request.headers }).cookies.get("sg-auth-next")?.value);
    const response = NextResponse.redirect(new URL(next, request.url), 303);
    response.cookies.set("sg-auth-next", "", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }, false);
}
