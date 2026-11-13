import { giftAudio, giftHeaders } from "@/lib/growth/gifts";
import { HttpError } from "@/lib/http-error";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return await giftAudio((await params).token, request.headers.get("range"));
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Gift audio is temporarily unavailable.",
      },
      { status: e instanceof HttpError ? e.status : 503, headers: giftHeaders },
    );
  }
}
