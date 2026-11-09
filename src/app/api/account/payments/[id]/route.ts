import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { getCustomerPayment } from "@/lib/account/payments";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return authRoute(request, async ({ user }) => NextResponse.json({ record: await getCustomerPayment(user!.id, (await context.params).id) }));
}
