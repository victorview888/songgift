import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return authRoute(request, async ({ supabase }) => {
    const { data, error } = await supabase.auth.getUser();
    const user = !error && data.user?.email_confirmed_at ? { id: data.user.id, email: data.user.email } : null;
    return NextResponse.json({ user });
  }, false);
}
