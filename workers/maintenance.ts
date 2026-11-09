import { runMaintenance } from "../src/lib/services/maintenance";

type Bindings = Record<string, string | undefined>;
const runtimeKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET", "FAL_KEY", "MUSICAPI_KEY", "MUSICAPI_BASE_URL", "MUREKA_API_KEY", "MUREKA_API_BASE_URL", "GOOGLE_CLOUD_PROJECT_ID", "GOOGLE_CLOUD_LOCATION", "GOOGLE_ACCESS_TOKEN", "GOOGLE_LYRIA_ACCESS_TOKEN", "GOOGLE_LYRIA_ENDPOINT", "RESEND_API_KEY", "SONGGIFT_FROM_EMAIL", "SONGGIFT_SITE_URL"];
const worker = {
  fetch() { return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }); },
  scheduled(_controller: { scheduledTime: number; cron: string }, env: Bindings, context: { waitUntil(promise: Promise<unknown>): void }) {
    if (env.SONGGIFT_MAINTENANCE_ENABLED !== "true") return;
    // Only deployment bindings, never HTTP input, initialize this server runtime.
    for (const key of runtimeKeys) { if (env[key] !== undefined) process.env[key] = env[key]; else delete process.env[key]; }
    context.waitUntil(runMaintenance().then(result => { console.log("SongGift maintenance", { started: result.started, jobs: result.jobs, mail: result.mail }); }).catch(() => { console.error("SongGift maintenance unavailable."); }));
  },
};

export default worker;
