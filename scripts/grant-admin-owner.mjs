import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

// Dry run by default. This is an operator-only tool, never an HTTP endpoint.
// Production --apply grants privileged access and requires explicit approval.
try {
  const { values } = parseArgs({ options: {
    "user-id": { type: "string" },
    "expected-project": { type: "string" },
    apply: { type: "boolean", default: false },
  }, strict: true, allowPositionals: false });
  const userId = values["user-id"];
  const expectedProject = values["expected-project"];
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || !expectedProject) {
    throw new Error("Use --user-id <verified-user-uuid> --expected-project <project-ref>. Add --apply only after reviewing the dry run.");
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  const target = new URL(url);
  if (target.hostname !== `${expectedProject}.supabase.co` || target.protocol !== "https:") {
    throw new Error("Supabase URL does not match --expected-project. No changes made.");
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data.user || data.user.id !== userId || !data.user.email_confirmed_at || !data.user.email || data.user.deleted_at || (data.user.banned_until && Date.parse(data.user.banned_until) > Date.now())) {
    throw new Error("The selected user must be an active, email-verified Auth account.");
  }
  const existing = await db.from("admin_members").select("user_id,role,active").eq("user_id", userId).maybeSingle();
  if (existing.error) throw new Error("Cannot read admin_members. Apply the administrator migration first.");
  console.log(JSON.stringify({ action: "grant-owner", project: expectedProject, userId, verifiedEmail: data.user.email, apply: values.apply }));
  if (!values.apply) {
    console.log("Dry run only. No membership changed.");
  } else if (existing.data?.role === "owner" && existing.data.active === true) {
    console.log("This verified account is already an active Owner. No changes needed.");
  } else {
    const row = { role: "owner", active: true, updated_at: new Date().toISOString() };
    const saved = existing.data
      ? await db.from("admin_members").update(row).eq("user_id", userId).select("user_id,role,active").single()
      : await db.from("admin_members").insert({ user_id: userId, ...row }).select("user_id,role,active").single();
    if (saved.error || saved.data?.user_id !== userId || saved.data.role !== "owner" || saved.data.active !== true) {
      throw new Error("Owner grant could not be verified. Recheck membership before retrying.");
    }
    console.log("Owner membership saved and verified. Reopen /admin with this account.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Owner initialization failed.");
  process.exitCode = 1;
}
