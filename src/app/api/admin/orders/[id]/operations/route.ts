import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { AuditedOperationError, parseAdminOperation, runAdminOperation } from "@/lib/admin/operations";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return adminRoute(request, async ({ user, admin }) => {
    const input = parseAdminOperation(await request.json());
    try { return NextResponse.json(await runAdminOperation((await context.params).id, input, user, admin)); }
    catch (error) {
      if (error instanceof AuditedOperationError) return NextResponse.json({ error: error.message, requestId: error.requestId, result: error.result }, { status: error.status });
      throw error;
    }
  });
}
