import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, beforeEach, after } from "node:test";
import { fixture, userId, otherId } from "./helpers/customer-fixture.mjs";

let f;
const migration = readFileSync("supabase/migrations/20261125131733_occasion_funnel_and_notification_diagnostics.sql", "utf8");
const params = (extra = {}) => ({ p_session: crypto.randomUUID(), p_key: crypto.randomUUID(), p_event: "page_view", p_page: "home", p_first: "direct", p_last: "direct", p_medium: "none", p_campaign: "", ...extra });
const event = (extra = {}) => ({ eventKey: crypto.randomUUID(), event: "sample_played", page: "home", first: "direct", last: "direct", medium: "none", campaign: "", occasion: "birthday", ...extra });
const request = (sid = crypto.randomUUID()) => new Request("http://localhost/api/analytics/events", { headers: { cookie: "sg_usage=" + sid } });
const report = () => f.rpc("songgift_usage_report", { p_from: new Date(Date.now() - 86400000).toISOString(), p_to: new Date(Date.now() + 86400000).toISOString() });
before(async () => { f = await fixture(); });
beforeEach(async () => {
  f.setFail({});
  await f.db.exec("reset role;delete from usage_events;delete from song_order_attribution;delete from usage_optouts;delete from audio_previews;delete from song_notification_outbox;set role service_role");
});
after(() => f?.close());

test("additive migration retains historical events, orders and both legacy RPC call forms", async () => {
  const old = await fixture({ beforeOccasionFunnel: true });
  try {
    const id = await old.order(), input = params();
    assert.equal(await old.rpc("record_songgift_usage", input), true);
    const before = (await old.db.query("select * from song_orders where id=$1", [id])).rows;
    await old.db.exec("reset role");
    await old.db.exec(migration);
    await old.db.exec("set role service_role");
    assert.deepEqual((await old.db.query("select * from song_orders where id=$1", [id])).rows, before);
    assert.equal((await old.db.query("select occasion from usage_events where event_key=$1", [input.p_key])).rows[0].occasion, null);
    assert.equal(await old.rpc("record_songgift_usage", params()), true);
    assert.equal(await old.rpc("record_songgift_usage", params({ p_order_id: id, p_user_id: userId })), true);
    assert.equal(await old.rpc("record_songgift_usage", params({ p_order_id: null, p_user_id: null, p_occasion: "christmas" })), true);
    assert.equal((await old.rpc("songgift_usage_report", { p_from: "2026-01-01", p_to: "2027-01-01" })).reportVersion, 2);
  } finally { await old.close(); }
});

test("coarse occasions and event contexts are validated at the API and SQL boundaries", async () => {
  const save = f.load("src/lib/growth/usage-server.ts").saveUsage;
  for (const bad of [event({ occasion: "person@example.com" }), event({ occasion: "/lyrics/private" }), event({ occasion: { story: "private" } }), event({ page: "create" }), event({ event: "story_started", page: "home" }), event({ event: "preview_played", page: "lyrics" })])
    await assert.rejects(save(request(), bad), e => e.status === 400);
  await assert.rejects(f.rpc("record_songgift_usage", params({ p_event: "preview_played", p_page: "lyrics", p_order_id: null, p_user_id: null, p_occasion: "birthday" })), /invalid_usage_context/);
  await assert.rejects(f.rpc("record_songgift_usage", params({ p_order_id: null, p_user_id: null, p_occasion: "private@example.com" })), /check constraint/);
  const sid = crypto.randomUUID(), input = event();
  await save(request(sid), input); await save(request(sid), input);
  assert.equal((await f.db.query("select count(*)::int n from usage_events where session_id=$1 and occasion='birthday'", [sid])).rows[0].n, 1);
  await f.load("src/lib/growth/usage-server.ts").forgetUsage(request(sid));
  assert.equal((await f.db.query("select count(*)::int n from usage_events where session_id=$1", [sid])).rows[0].n, 0);
  await assert.rejects(save(request(sid), event()), e => e.status === 429);
});

test("personal playback requires the owner and always uses the stored order occasion", async () => {
  const id = await f.order(), sid = crypto.randomUUID();
  await f.db.query("update song_orders set occasion='In memory' where id=$1", [id]);
  const post = who => f.load("src/app/api/analytics/order/route.ts").POST(new Request("http://localhost/api/analytics/order", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: "sg_usage=" + sid, ...(who ? { "x-fixture-user": who } : {}) },
    body: JSON.stringify({ ...event({ event: "preview_played", page: "lyrics", occasion: "christmas" }), orderId: id }),
  }));
  assert.equal((await post(null)).status, 401);
  assert.equal((await post(otherId)).status, 404);
  assert.equal((await post(userId)).status, 200);
  assert.deepEqual((await f.db.query("select event,occasion from usage_events where session_id=$1", [sid])).rows, [{ event: "preview_played", occasion: "memorial" }]);
  await assert.rejects(f.rpc("record_songgift_usage", params({ p_order_id: id, p_user_id: otherId, p_occasion: "birthday" })), /order_not_found/);
});

test("report separates opt-in scene events from server preview cohorts and real payments", async () => {
  const save = f.load("src/lib/growth/usage-server.ts").saveUsage;
  await save(request(), event()); await save(request(), event({ occasion: null }));
  for (const [state, environment, old] of [["ready", "production", false], ["processing", "production", false], ["failed", "production", false], ["needs_review", "production", false], ["ready", "test", false], ["ready", "production", true]]) {
    const id = await f.order();
    await f.db.query("insert into audio_previews(order_id,user_id,provider,model,environment,input_snapshot,state,storage_bucket,clip_path,full_path,clip_seconds,full_sha256,clip_sha256,created_at) values($1,$2,'fal','isolated',$3,'{}',$4,'songs','clip.wav','full.wav',60,repeat('a',64),repeat('b',64),$5)", [id, userId, environment, state, new Date(Date.now() - (old ? 3 : 0) * 86400000).toISOString()]);
  }
  await f.db.query("insert into audio_demo_batches(token_hash,actor_id) values(repeat('c',64),$1)", [userId]);
  await f.db.query("insert into audio_previews(kind,public_slug,batch_id,provider,model,environment,input_snapshot,state) select 'sample','birthday-demo',id,'fal','isolated','production','{}','pending' from audio_demo_batches limit 1");
  const data = await report();
  assert.equal(data.reportVersion, 2);
  assert.equal(data.occasionSteps.find(r => r.occasion === "birthday").events, 1);
  assert.equal(data.occasionSteps.find(r => r.occasion === null).browsers, 1);
  assert.deepEqual(data.previewCohort, { created: 4, ready: 1, processing: 1, failed: 1, needsReview: 1 });
  assert.equal(data.captures, 0); assert.equal(data.attributedCaptures, 0);
  const rows = (await f.load("src/lib/admin/workspace.ts").workspaceData("analytics", new URLSearchParams())).rows;
  assert.ok(rows.some(r => r.label === "生日 / 公开样曲播放"));
  assert.ok(rows.some(r => r.label === "未指定场景 / 公开样曲播放"));
});

test("new RPCs remain private and cannot be executed by browser database roles", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const privileges = (await f.db.query("select has_function_privilege($1,'public.record_songgift_usage(uuid,uuid,text,text,text,text,text,text,uuid,uuid,text)','execute') usage,has_function_privilege($1,'public.songgift_notification_summary()','execute') notice,has_function_privilege($1,'public.songgift_usage_report(timestamptz,timestamptz)','execute') report", [role])).rows[0];
    assert.ok(Object.values(privileges).every(v => v === (role === "service_role")));
  }
  const security = (await f.db.query("select prosecdef from pg_proc where proname in ('record_songgift_usage','songgift_notification_summary','songgift_usage_report')")).rows;
  assert.ok(security.every(r => !r.prosecdef));
});

test("system diagnostics report aggregate outbox states without sending, and failures stay unknown", async () => {
  for (const status of ["pending", "sending", "sent", "failed", "needs_review", "skipped"]) {
    const id = await f.order(), job = crypto.randomUUID();
    await f.db.query("insert into generation_jobs(id,order_id,submission_key,attempt_no,environment,provider,model,state) values($1,$2,$3,1,'production','fal','isolated','failed')", [job, id, crypto.randomUUID()]);
    await f.db.query("insert into song_notification_outbox(dedupe_key,job_id,order_id,user_id,to_email,recipient_name,status,attempts,sent_at,provider_message_id) values($1,$2,$3,$4,'owner@isolated.example','Private recipient',$5,1,$6,$7)", [crypto.randomUUID(), job, id, userId, status, status === "sent" ? new Date().toISOString() : null, status === "sent" ? "isolated-message" : null]);
  }
  const summary = await f.rpc("songgift_notification_summary", {});
  for (const key of ["pending", "sending", "sent", "failed", "needsReview", "skipped", "retrying"]) assert.equal(summary[key], 1);
  assert.doesNotMatch(JSON.stringify(summary), /owner@|Private recipient|isolated-message/);
  const work = f.load("src/lib/admin/workspace.ts");
  let rows = (await work.workspaceData("system", new URLSearchParams())).rows;
  assert.equal(rows.find(r => r.item === "通知发件箱").state, "1 条待处理 / 1 条发送中");
  assert.equal(rows.find(r => r.item === "歌曲通知（网站配置）").state, "未配置");
  assert.equal(rows.find(r => r.item === "维护最近结果").state, "尚无完成结果");
  f.env.RESEND_API_KEY = "isolated"; f.env.SONGGIFT_FROM_EMAIL = "invalid\r\nfrom";
  rows = (await work.workspaceData("system", new URLSearchParams())).rows;
  assert.equal(rows.find(r => r.item === "歌曲通知（网站配置）").state, "未配置");
  f.setFail({ rpc: "songgift_notification_summary" });
  rows = (await work.workspaceData("system", new URLSearchParams())).rows;
  assert.equal(rows.find(r => r.item === "通知发件箱").state, "查询失败");
  assert.equal(rows.find(r => r.item === "数据库").state, "连接成功");
  assert.equal(f.sentEmails.size, 0); assert.equal(f.generateCalls, 0);
});
