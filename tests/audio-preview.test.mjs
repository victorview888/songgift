import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import { fixture, userId, otherId } from "./helpers/customer-fixture.mjs";
let f;
const migration = readFileSync("supabase/migrations/20261115140948_free_song_audio_preview.sql", "utf8");
before(async () => { f = await fixture(); await f.db.exec("reset role"); await f.db.exec(migration); await f.db.exec("set role service_role"); });
after(() => f?.close());
beforeEach(async () => {
  f.setFail({}); f.setMode("queued"); f.env.SONGGIFT_AUDIO_PREVIEW_ENABLED = "true"; f.env.SONGGIFT_AUDIO_PREVIEW_DAILY_LIMIT = "10"; f.env.FAL_KEY = "isolated-key";
  await f.db.exec("reset role; delete from public.audio_preview_allowances; update public.audio_preview_daily set starts=0; set role service_role");
});
const endpoint = "src/app/api/orders/[id]/preview/route.ts";
const api = () => f.load("src/lib/services/audio-preview.ts");
const orders = () => f.load("src/lib/supabase/orders.ts");
const post = (id, user = userId) => f.request(endpoint, "POST", {}, user, { id });
async function complete(id) {
  const p = await api().findOrderPreview(id, userId);
  await f.db.query("update public.audio_previews set next_check_at=now()-interval '1 second' where id=$1", [p.id]);
  return api().processAudioPreview(await api().findOrderPreview(id, userId));
}
test("unpaid users receive one frozen recording; duplicate submission and playback do not consume more allowance", async () => {
  const id = await f.order(), second = await f.order(), before = f.generateCalls;
  const responses = await Promise.all([post(id), post(id)]);
  assert.ok(responses.every(r => r.status === 200), await responses[0].clone().text());
  assert.equal(f.generateCalls - before, 1);
  assert.equal((await post(second)).status, 409);
  assert.equal((await f.db.query("select starts from public.audio_preview_daily")).rows[0].starts, 1);
  const p = await complete(id); assert.equal(p.state, "ready");
  const body = await (await f.request(endpoint, "GET", null, userId, { id })).json();
  assert.equal(body.lyricsLocked, true); assert.equal(body.canCreate, false);
  assert.equal(JSON.stringify(body).includes("source_url"), false); assert.equal(JSON.stringify(body).includes("full_path"), false);
  assert.equal((await orders().getOwnedOrder(id, userId)).song_assets.length, 0);
  await assert.rejects(orders().saveApprovedLyrics(id, userId, "These changed lyrics must not alter the reserved audio."));
  assert.equal((await f.request("src/app/api/orders/[id]/route.ts", "PATCH", { lyricsText: "These changed lyrics must not alter the reserved audio." }, userId, { id })).status, 409);
  assert.equal(f.generateCalls - before, 1);
});
test("anonymous and other users cannot reserve, inspect or stream the owner's preview", async () => {
  const id = await f.order(); assert.equal((await post(id, null)).status, 401);
  assert.equal((await post(id, otherId)).status, 404);
  assert.equal((await post(id)).status, 200); await complete(id);
  const audio = "src/app/api/orders/[id]/preview/audio/route.ts";
  assert.equal((await f.request(audio, "GET", null, otherId, { id })).status, 404);
  assert.equal((await f.request(audio, "GET", null, null, { id })).status, 401);
  const response = await f.request(audio, "GET", null, userId, { id }); assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.equal(response.headers.get("content-type"), "audio/wav");
});
test("payment unlocks the exact stored original without another model call; a paid marker alone cannot unlock", async () => {
  const id = await f.order(); await post(id); const preview = await complete(id), calls = f.generateCalls;
  await assert.rejects(api().unlockAudioPreview(await orders().getOwnedOrder(id, userId), userId), /payment/);
  await f.db.query("update public.song_orders set paid_at=now() where id=$1", [id]);
  await assert.rejects(api().unlockAudioPreview(await orders().getOwnedOrder(id, userId), userId));
  await f.db.query("update public.song_orders set paid_at=null where id=$1", [id]);
  await f.rpc("prepare_songgift_checkout", { p_order_id: id, p_user_id: userId, p_amount_minor: 999, p_environment: "sandbox", p_price_version: "v1" });
  await f.rpc("bind_songgift_checkout", { p_order_id: id, p_user_id: userId, p_paypal_order_id: "PREVIEW-" + id });
  await f.rpc("record_songgift_capture", { p_order_id: id, p_user_id: userId, p_paypal_order_id: "PREVIEW-" + id, p_capture_id: "CAP-" + id, p_environment: "sandbox", p_amount_minor: 999, p_currency: "USD", p_occurred_at: new Date().toISOString() });
  const start = () => f.load("src/lib/services/generation.ts").startOrderGeneration;
  const results = await Promise.all([start()(await orders().getOwnedOrder(id, userId), userId), start()(await orders().getOwnedOrder(id, userId), userId)]);
  assert.ok(results.every(r => r.status === "completed")); assert.equal(f.generateCalls, calls);
  const asset = (await f.db.query("select * from public.song_assets where order_id=$1", [id])).rows;
  assert.equal(asset.length, 1); assert.equal(asset[0].storage_path, preview.full_path);
  assert.equal((await f.db.query("select count(*)::int n from public.generation_jobs where order_id=$1", [id])).rows[0].n, 1);
});
test("a lost provider submission keeps the allowance reserved and never submits again automatically", async () => {
  const id = await f.order(); f.setMode("unknown"); const calls = f.generateCalls;
  assert.equal((await post(id)).status, 502); assert.equal(f.generateCalls - calls, 1);
  const p = await api().findOrderPreview(id, userId); assert.equal(p.state, "needs_review");
  await post(id); assert.equal(f.generateCalls - calls, 1);
  assert.equal((await post(await f.order())).status, 409);
});
test("confirmed provider failure restores the lifetime allowance; retries still count toward the daily budget", async () => {
  const id = await f.order(); f.setMode("failed"); assert.equal((await post(id)).status, 200);
  assert.equal((await api().findOrderPreview(id, userId)).state, "failed");
  f.setMode("queued"); assert.equal((await post(id)).status, 200);
  assert.equal((await f.db.query("select starts from public.audio_preview_daily")).rows[0].starts, 2);
});
test("the global budget is enforced in the reservation transaction without consuming an unused account allowance", async () => {
  f.env.SONGGIFT_AUDIO_PREVIEW_DAILY_LIMIT = "1";
  assert.equal((await post(await f.order())).status, 200);
  const other = await f.order({ owner: otherId }); assert.equal((await post(other, otherId)).status, 429);
  assert.equal((await f.db.query("select preview_id from public.audio_preview_allowances where user_id=$1", [otherId])).rows.length, 0);
});
test("storage failures recover the original provider task without new music or a public full asset", async () => {
  const id = await f.order(); await post(id); const before = f.generateCalls;
  f.setFail({ upload: true }); await assert.rejects(complete(id));
  assert.equal((await api().findOrderPreview(id, userId)).state, "storing");
  f.setFail({}); assert.equal((await complete(id)).state, "ready"); assert.equal(f.generateCalls, before);
  assert.equal((await f.db.query("select count(*)::int n from public.song_assets where order_id=$1", [id])).rows[0].n, 0);
});
test("a saved full source recovers a failed clip upload even after the provider download expires", async () => {
  const id = await f.order(); await post(id); const calls = f.generateCalls;
  f.setFail({ clipUpload: true }); await assert.rejects(complete(id));
  const partial = await api().findOrderPreview(id, userId); assert.ok(partial.full_path && partial.full_sha256);
  f.setFail({ download: true }); const polls = f.pollCalls;
  assert.equal((await complete(id)).state, "ready"); assert.equal(f.generateCalls, calls); assert.equal(f.pollCalls, polls);
});
test("a cached original result can recover storage while provider status polling is unavailable", async () => {
  const id = await f.order(); await post(id); const calls = f.generateCalls;
  f.setFail({ upload: true }); await assert.rejects(complete(id));
  f.setFail({ query: true });
  assert.equal((await complete(id)).state, "ready"); assert.equal(f.generateCalls, calls);
});
test("old paid-generation reservation cannot submit a second recording for an existing audio preview", async () => {
  const id = await f.order(); await post(id); await complete(id);
  await assert.rejects(f.rpc("reserve_songgift_generation", { p_order_id: id, p_user_id: userId, p_request_id: id, p_provider: "mock", p_model: "local-preview", p_environment: "test" }));
});
test("only an active Owner can reserve the fixed three public demos; scoped tokens only advance that batch", async () => {
  const token = Buffer.alloc(32, 7).toString("base64url"), tokenHash = createHash("sha256").update(token).digest("hex");
  const inputs = ["birthday-demo", "anniversary-demo", "christmas-demo"].map(slug => ({ slug, title: "Original isolated demo", input: { recipientName: "Alex", occasion: "Birthday", story: "Fictional original demo story", mood: "Warm", style: "Acoustic", lyricsText: "This is an original fictional lyric used only in an isolated test." } }));
  await assert.rejects(f.rpc("reserve_songgift_demo_samples", { p_actor_id: otherId, p_token_hash: tokenHash, p_inputs: inputs }), /admin_denied/);
  await f.db.exec("reset role"); await f.db.query("insert into public.admin_members(user_id) values($1) on conflict do nothing", [userId]); await f.db.exec("set role service_role");
  const batch = await f.rpc("reserve_songgift_demo_samples", { p_actor_id: userId, p_token_hash: tokenHash, p_inputs: inputs });
  await assert.rejects(api().advanceDemoBatch("A".repeat(43)), /not found/);
  const calls = f.generateCalls;
  for (let i = 0; i < 3; i++) await api().advanceDemoBatch(token);
  assert.equal(f.generateCalls - calls, 3);
  await f.db.query("update public.audio_previews set next_check_at=now()-interval '1 second' where batch_id=$1", [batch]);
  f.setFail({ clipUpload: true });
  await assert.rejects(api().advanceDemoBatch(token), /excerpt_upload \(Error\)/);
  f.setFail({});
  await f.db.query("update public.audio_previews set next_check_at=now()-interval '1 second' where batch_id=$1", [batch]);
  let result;
  for (let i = 0; i < 3; i++) result = await api().advanceDemoBatch(token);
  assert.equal(result.ready, 3); assert.equal(result.pending, false);
  await api().advanceDemoBatch(token); assert.equal(f.generateCalls - calls, 3);
  assert.equal((await f.db.query("select count(*)::int n from public.audio_previews where kind='sample' and is_public")).rows[0].n, 3);
  await assert.rejects(f.rpc("reserve_songgift_demo_samples", { p_actor_id: userId, p_token_hash: tokenHash, p_inputs: inputs }), /samples_already_reserved/);
  await f.db.query("update public.admin_members set active=false where user_id=$1", [userId]);
  await assert.rejects(api().advanceDemoBatch(token), /no longer active/);
});
test("private preview tables and mutating functions are inaccessible to anonymous and customer database roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`reset role; set role ${role}`);
    await assert.rejects(f.db.query("select * from public.audio_previews"));
    await assert.rejects(f.db.query("select * from public.audio_preview_allowances"));
    await assert.rejects(f.db.query("select public.claim_songgift_preview(gen_random_uuid())"));
  }
  await f.db.exec("reset role; set role service_role");
});
