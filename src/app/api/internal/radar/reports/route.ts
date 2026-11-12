import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http-error";
import { RadarKeyUnavailable, verifyRadarIdentity } from "@/lib/radar/github-identity";
import { readRadarBody, validateRadarReport } from "@/lib/radar/report";
import { saveRadarReport } from "@/lib/radar/store";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  try {
    const identity = await verifyRadarIdentity(request);
    const report = validateRadarReport(await readRadarBody(request));
    if (identity.runId !== report.runId || identity.runAttempt !== report.runAttempt || identity.commitSha !== report.commitSha) throw new HttpError(403, "报告与采集任务身份不一致。");
    const age = Date.now() - Date.parse(report.generatedAt);
    if (age < -300000 || age > 1800000) throw new HttpError(400, "报告生成时间无效。");
    const saved = await saveRadarReport(report);
    return NextResponse.json(saved, { status: saved.duplicate ? 200 : 201, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "报告上报暂时不可用。", ...(error instanceof RadarKeyUnavailable ? { code: error.code } : {}) }, { status: error instanceof HttpError ? error.status : 503, headers });
  }
}
