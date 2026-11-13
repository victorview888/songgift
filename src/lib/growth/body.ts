import { HttpError } from "@/lib/http-error";
export async function smallJson(
  request: Request,
  max = 4096,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "JSON is required.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid request.");
  } finally {
    reader.releaseLock();
  }
}
