import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";

export async function POST(request: Request) {
  return authRoute(request, async ({ supabase }) => {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.json({ ok: true });
  }, false);
}
