import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { getAdminOrderHistory } from "@/lib/admin/order-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminRoute(request, async () => NextResponse.json(await getAdminOrderHistory((await context.params).id)));
}
