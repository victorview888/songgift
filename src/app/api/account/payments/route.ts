import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { listCustomerPayments } from "@/lib/account/payments";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return authRoute(request, async ({ user }) => NextResponse.json(await listCustomerPayments(user!.id, new URL(request.url).searchParams.get("page"))));
}
