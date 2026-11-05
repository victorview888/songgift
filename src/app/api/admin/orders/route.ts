import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { listAdminOrders, parseOrderFilters } from "@/lib/admin/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return adminRoute(request, async () => {
    const filters = parseOrderFilters(new URL(request.url).searchParams);
    return NextResponse.json(await listAdminOrders(filters));
  });
}
