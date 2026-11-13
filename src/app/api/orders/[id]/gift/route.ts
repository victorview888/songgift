import { NextResponse } from "next/server";
import { authRoute } from "@/lib/auth/server";
import { smallJson } from "@/lib/growth/body";
import { ownedGift, setGift } from "@/lib/growth/gifts";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authRoute(request, async ({ user }) =>
    NextResponse.json(await ownedGift((await context.params).id, user!.id)),
  );
}
export async function POST(request: Request, context: Context) {
  return authRoute(request, async ({ user }) => {
    return NextResponse.json(
      await setGift(
        (await context.params).id,
        user!.id,
        await smallJson(request),
      ),
    );
  });
}
