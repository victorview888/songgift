import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { getAdminOrderDetail } from "@/lib/admin/order-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminRoute(request, async () => {
    const { id } = await context.params;
    return NextResponse.json(await getAdminOrderDetail(id));
  });
}
