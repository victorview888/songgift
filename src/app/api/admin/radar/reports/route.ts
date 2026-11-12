import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { listRadarReports, radarPage } from "@/lib/radar/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return adminRoute(request, async () => NextResponse.json(await listRadarReports(radarPage(new URL(request.url).searchParams))));
}
