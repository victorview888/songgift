import "server-only";
import { HttpError } from "@/lib/http-error";

export const RADAR_AUDIENCE = "https://www.songforalways.com/api/internal/radar/reports";
const ISSUER = "https://token.actions.githubusercontent.com";
const REPOSITORY = "victorview888/songgift";
const REPO_ID = "1432492683", OWNER_ID = "261133674";
const WORKFLOW = `${REPOSITORY}/.github/workflows/radar-free.yml@refs/heads/master`;
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
let cache: { keys: Jwk[]; loaded: number } | undefined;
export class RadarKeyUnavailable extends HttpError {
  constructor(public code: string) { super(503, "采集身份验证暂时不可用，请重试。"); }
}

function denied(): never { throw new HttpError(401, "采集任务身份无效或已过期。"); }
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) denied();
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
function part(value: string): Record<string, unknown> {
  const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decode(value)));
  if (!result || typeof result !== "object" || Array.isArray(result)) denied();
  return result;
}
async function keyFor(kid: string): Promise<Jwk> {
  const now = Date.now();
  if (!cache || now - cache.loaded > 300000 || (!cache.keys.some(k => k.kid === kid) && now - cache.loaded > 60000)) {
    try {
      const response = await fetch(`${ISSUER}/.well-known/jwks`, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "SongGift-Free-Radar/1" }, redirect: "error", signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new RadarKeyUnavailable(`RADAR_KEYS_HTTP_${response.status}`);
      const text = await response.text();
      if (text.length > 131072) throw new Error("keys too large");
      const data = JSON.parse(text);
      if (!Array.isArray(data.keys) || !data.keys.length || data.keys.length > 20) throw new Error("keys malformed");
      cache = { keys: data.keys, loaded: now };
    } catch (error) { throw error instanceof RadarKeyUnavailable ? error : new RadarKeyUnavailable(error instanceof TypeError ? "RADAR_KEYS_TRANSPORT" : "RADAR_KEYS_UNAVAILABLE"); }
  }
  const key = cache.keys.find(k => k.kid === kid && k.kty === "RSA" && (!k.alg || k.alg === "RS256") && (!k.use || k.use === "sig"));
  if (!key) denied();
  return key;
}

export async function verifyRadarIdentity(request: Request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length > 20000) denied();
  try {
    const pieces = auth.slice(7).split(".");
    if (pieces.length !== 3) denied();
    const header = part(pieces[0]), claims = part(pieces[1]);
    if (header.alg !== "RS256" || header.typ !== "JWT" || typeof header.kid !== "string" || header.kid.length > 200 || header.crit !== undefined) denied();
    const now = Math.floor(Date.now() / 1000);
    const number = (key: string) => typeof claims[key] === "number" && Number.isSafeInteger(claims[key]) ? claims[key] as number : denied();
    const exp = number("exp"), iat = number("iat"), nbf = number("nbf");
    if (exp <= now || nbf > now + 30 || iat > now + 30 || iat < now - 600 || exp - iat > 900 || exp <= iat || nbf > exp) denied();
    const subjects = [`repo:${REPOSITORY}:ref:refs/heads/master`, `repo:victorview888@${OWNER_ID}/songgift@${REPO_ID}:ref:refs/heads/master`];
    if (claims.iss !== ISSUER || claims.aud !== RADAR_AUDIENCE || claims.repository !== REPOSITORY || claims.repository_id !== REPO_ID || claims.repository_owner_id !== OWNER_ID || claims.ref !== "refs/heads/master" || claims.ref_type !== "branch" || claims.workflow_ref !== WORKFLOW || !subjects.includes(String(claims.sub)) || !["schedule", "workflow_dispatch"].includes(String(claims.event_name)) || claims.runner_environment !== "github-hosted") denied();
    if (typeof claims.run_id !== "string" || !/^\d{1,20}$/.test(claims.run_id) || typeof claims.run_attempt !== "string" || !/^[1-9]\d{0,4}$/.test(claims.run_attempt) || typeof claims.sha !== "string" || !/^[a-f0-9]{40}$/.test(claims.sha) || claims.workflow_sha !== claims.sha) denied();
    const jwk = await keyFor(header.kid);
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(pieces[2]), new TextEncoder().encode(pieces[0] + "." + pieces[1]))) denied();
    return { runId: claims.run_id, runAttempt: Number(claims.run_attempt), commitSha: claims.sha };
  } catch (error) { if (error instanceof HttpError) throw error; denied(); }
}
