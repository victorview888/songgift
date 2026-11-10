import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { reviewContentReport } from "@/lib/safety/reports";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminRoute(request, async ({ admin }) => NextResponse.json(await reviewContentReport((await context.params).id, admin.userId, await request.json())));
}
