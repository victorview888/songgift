import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { getAdminOverview } from "@/lib/admin/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return adminRoute(request, async () => NextResponse.json(await getAdminOverview()));
}
