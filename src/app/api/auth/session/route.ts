import { NextResponse } from "next/server";
import { authRoute, HttpError } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return authRoute(request, async ({ supabase }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error && (!error.status || error.status >= 500 || error.status === 429)) throw new HttpError(503, "Session check is temporarily unavailable. Please retry.");
    const user = !error && data.user?.email_confirmed_at ? { id: data.user.id, email: data.user.email } : null;
    return NextResponse.json({ user });
  }, false);
}
