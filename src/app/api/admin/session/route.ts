import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return adminRoute(request, async ({ admin }) => NextResponse.json({ admin }));
}
