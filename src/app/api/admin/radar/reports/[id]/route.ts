import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { getRadarReport } from "@/lib/radar/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminRoute(request, async () => NextResponse.json(await getRadarReport((await context.params).id)));
}
