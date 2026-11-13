import { authRoute } from "@/lib/auth/server";
import { smallJson } from "@/lib/growth/body";
import { saveUsage, forgetUsage } from "@/lib/growth/usage-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return authRoute(
    request,
    async () =>
      Response.json(await saveUsage(request, await smallJson(request))),
    false,
  );
}
export async function DELETE(request: Request) {
  return authRoute(
    request,
    async () => Response.json(await forgetUsage(request)),
    false,
  );
}
