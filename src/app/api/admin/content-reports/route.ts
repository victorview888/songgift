import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { listContentReports } from "@/lib/safety/reports";

export async function GET(request: Request) {
  return adminRoute(request, async () => NextResponse.json(await listContentReports(new URL(request.url).searchParams)));
}
