import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { submitContentReport } from "@/lib/safety/reports";

export async function POST(request: Request) {
  return authRoute(request, async () => NextResponse.json(await submitContentReport(request), { status: 201 }), false);
}
