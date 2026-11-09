import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { listAdminJobs, parseJobFilters } from "@/lib/admin/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return adminRoute(request, async () => NextResponse.json(await listAdminJobs(parseJobFilters(new URL(request.url).searchParams))));
}
