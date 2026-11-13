import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth/admin";
import { workspaceData } from "@/lib/admin/workspace";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return adminRoute(request, async () =>
    NextResponse.json(
      await workspaceData("users", new URL(request.url).searchParams),
    ),
  );
}
