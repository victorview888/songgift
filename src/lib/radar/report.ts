import { HttpError } from "@/lib/http-error";

export const MAX_RADAR_BYTES = 128 * 1024;
export type RadarSource = { id: string; name: string; status: "ok" | "baseline" | "error" | "off"; count: number; newCount: number; note: string };
export type RadarItem = { kind: "repository" | "model" | "page" | "term"; title: string; sourceId: string; url: string | null; detail: string };
export type RadarReport = { schemaVersion: 1; runId: string; runAttempt: number; commitSha: string; generatedAt: string; sources: RadarSource[]; items: RadarItem[] };

function invalid(): never { throw new HttpError(400, "雷达报告格式无效。"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid();
  return value.trim();
}
function integer(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) invalid();
  return value;
}
export function assertRadarId(id: string) {
  if (!/^\d{1,20}-[1-9]\d{0,4}$/.test(id)) throw new HttpError(404, "报告不存在。");
}
export function validateRadarReport(input: unknown): RadarReport {
  const value = object(input);
  if (value.schemaVersion !== 1) invalid();
  const runId = text(value.runId, 20), commitSha = text(value.commitSha, 40);
  const runAttempt = integer(value.runAttempt, 99999);
  if (!/^\d+$/.test(runId) || runAttempt < 1 || !/^[a-f0-9]{40}$/.test(commitSha)) invalid();
  const date = text(value.generatedAt, 40);
  if (!/^\d{4}-\d\d-\d\dT.*Z$/.test(date) || !Number.isFinite(Date.parse(date))) invalid();
  if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 12 || !Array.isArray(value.items) || value.items.length > 60) invalid();
  const seen = new Set<string>();
  const sources: RadarSource[] = value.sources.map(raw => {
    const source = object(raw), id = text(source.id, 64), name = text(source.name, 100);
    const status = text(source.status, 10) as RadarSource["status"];
    if (!/^[a-z0-9:_-]+$/.test(id) || seen.has(id) || !["ok", "baseline", "error", "off"].includes(status)) invalid();
    seen.add(id);
    return { id, name, status, count: integer(source.count, 1000000000), newCount: integer(source.newCount, 1000000000), note: text(source.note, 300, true) };
  });
  const items: RadarItem[] = value.items.map(raw => {
    const item = object(raw), kind = text(item.kind, 20) as RadarItem["kind"], sourceId = text(item.sourceId, 64);
    if (!["repository", "model", "page", "term"].includes(kind) || !seen.has(sourceId)) invalid();
    let url: string | null = null;
    if (item.url !== null) {
      const rawUrl = text(item.url, 2048);
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) invalid();
        url = parsed.toString();
      } catch { invalid(); }
    }
    return { kind, sourceId, title: text(item.title, 180), detail: text(item.detail, 500, true), url };
  });
  return { schemaVersion: 1, runId, runAttempt, commitSha, generatedAt: new Date(date).toISOString(), sources, items };
}

export async function readRadarBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new HttpError(415, "请提交 JSON 报告。");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RADAR_BYTES)) throw new HttpError(413, "雷达报告过大。");
  const reader = request.body?.getReader();
  if (!reader) invalid();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RADAR_BYTES) { await reader.cancel(); throw new HttpError(413, "雷达报告过大。"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) { if (error instanceof HttpError) throw error; invalid(); }
  finally { reader.releaseLock(); }
}
