import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after, beforeEach } from "node:test";
import { fixture, userId, otherId, wav } from "./helpers/customer-fixture.mjs";
let f;
before(async () => {
  f = await fixture();
});
after(() => f?.close());
beforeEach(() => f.setFail({}));
const settings = "src/app/api/orders/[id]/gift/route.ts",
  audio = "src/app/api/gifts/[token]/audio/route.ts";
async function asset(id) {
  const key = id + "/final.wav";
  f.objects.set("songs/" + key, wav());
  await f.db.query(
    "insert into song_assets(order_id,storage_path,mime_type,provider,model_id,is_final) values($1,$2,'audio/wav','fal','isolated-model',true)",
    [id, key],
  );
}
const body = (extra = {}) => ({
  active: true,
  confirmed: true,
  greeting: "For you,\nwith love.",
  ...extra,
});
const usage = (extra = {}) => ({
  eventKey: crypto.randomUUID(),
  event: "page_view",
  page: "home",
  first: "google",
  last: "google",
  medium: "organic",
  campaign: "",
  ...extra,
});
const usageRequest = (id = crypto.randomUUID()) =>
  new Request("http://localhost/api/analytics/events", {
    headers: { cookie: "sg_usage=" + id },
  });
const gifts = () => f.load("src/lib/growth/gifts.ts"),
  stats = () => f.load("src/lib/growth/usage-server.ts");

test("additive upgrade backfills account metadata and preserves existing orders and audio", async () => {
  const old = await fixture({ legacyContent: true });
  try {
    const id = await old.order({ paid: true });
    await old.db.query(
      "insert into song_assets(order_id,storage_path,mime_type,provider,model_id,is_final) values($1,'historical.wav','audio/wav','fal','isolated-historical',true)",
      [id],
    );
    const oldAssets = (await old.db.query("select * from song_assets")).rows;
    const before = (
      await old.db.query("select * from song_orders where id=$1", [id])
    ).rows;
    await old.db.exec("reset role");
    await old.db.exec(
      readFileSync(
        "supabase/migrations/20261113100430_admin_gifting_growth.sql",
        "utf8",
      ),
    );
    assert.deepEqual(
      (await old.db.query("select * from song_orders where id=$1", [id])).rows,
      before,
    );
    const directory = await old.db.query(
      "select user_id,email,verified from admin_customer_directory",
    );
    assert.deepEqual(
      (await old.db.query("select * from song_assets")).rows,
      oldAssets,
    );
    assert.equal(directory.rows.length, 2);
    assert.ok(directory.rows.every((r) => r.verified));
    assert.equal(
      (await old.db.query("select count(*)::int n from song_gifts")).rows[0].n,
      0,
    );
    assert.equal(
      (await old.db.query("select count(*)::int n from usage_events")).rows[0]
        .n,
      0,
    );
  } finally {
    await old.close();
  }
});

test("Auth directory synchronises under the Auth server role; customer roles cannot read or call private modules", async () => {
  await f.db.exec(
    "reset role;grant usage on schema auth to supabase_auth_admin;grant select,insert,update on auth.users to supabase_auth_admin;set role supabase_auth_admin",
  );
  try {
    await f.db.query(
      "update auth.users set email=$1,last_sign_in_at=now() where id=$2",
      ["updated@isolated.example", otherId],
    );
  } finally {
    await f.db.exec("reset role;set role service_role");
  }
  const row = (
    await f.db.query(
      "select email,last_sign_in_at from admin_customer_directory where user_id=$1",
      [otherId],
    )
  ).rows[0];
  assert.equal(row.email, "updated@isolated.example");
  assert.ok(row.last_sign_in_at);
  for (const role of ["anon", "authenticated"]) {
    for (const table of [
      "admin_customer_directory",
      "song_gifts",
      "usage_events",
      "song_order_attribution",
      "usage_optouts",
    ]) {
      await f.db.exec("reset role;set role " + role);
      try {
        await assert.rejects(
          f.db.query("select * from " + table),
          (e) => e.code === "42501",
        );
      } finally {
        await f.db.exec("reset role;set role service_role");
      }
    }
    const privileges = await f.db.query(
      "select has_function_privilege($1,'public.list_songgift_customers(integer,text,text)','execute') users,has_function_privilege($1,'public.set_songgift_gift(uuid,uuid,boolean,text,text)','execute') gift,has_function_privilege($1,'public.record_songgift_usage(uuid,uuid,text,text,text,text,text,text,uuid,uuid)','execute') usage",
      [role],
    );
    assert.ok(
      Object.values(privileges.rows[0]).every((value) => value === false),
    );
  }
});

test("account search escapes wildcards, filters verification and uses stable server pagination", async () => {
  await f.db.exec("reset role");
  try {
    for (let i = 0; i < 25; i++)
      await f.db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)",
        [
          crypto.randomUUID(),
          "member" + i + "@isolated.example",
          i % 2 ? "2026-11-01T00:00:00Z" : null,
        ],
      );
    await f.db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [crypto.randomUUID(), "literal_%@isolated.example"],
    );
  } finally {
    await f.db.exec("set role service_role");
  }
  const work = f.load("src/lib/admin/workspace.ts");
  let result = await work.workspaceData(
    "users",
    new URLSearchParams("q=" + encodeURIComponent("literal_%")),
  );
  assert.equal(result.total, 1);
  result = await work.workspaceData(
    "users",
    new URLSearchParams("verified=no"),
  );
  assert.equal(result.total, 13);
  assert.ok(result.rows.every((r) => !r.verified));
  const first = await work.workspaceData("users", new URLSearchParams()),
    second = await work.workspaceData("users", new URLSearchParams("page=2"));
  assert.equal(first.rows.length, 20);
  assert.equal(second.rows.length, 8);
  assert.equal(
    new Set([...first.rows, ...second.rows].map((r) => r.user_id)).size,
    28,
  );
  const text = JSON.stringify(first);
  assert.doesNotMatch(text, /password|metadata|access_token|refresh_token/);
  for (const q of [
    "page=0",
    "page=1&page=2",
    "verified=unknown",
    "from=2026-02-30",
    "actor=bad",
    "action=delete",
  ])
    assert.throws(
      () => work.readFilters(new URLSearchParams(q)),
      (e) => e.status === 400,
    );
  f.setFail({ rpc: "list_songgift_customers" });
  await assert.rejects(
    work.workspaceData("users", new URLSearchParams()),
    (e) => e.status === 503 && !e.message.includes("PRIVATE"),
  );
});

test("gift sharing rejects guests, foreign orders, missing permission, unpaid and unfinished songs", async () => {
  const id = await f.order();
  assert.equal(
    (await f.request(settings, "GET", null, null, { id })).status,
    401,
  );
  assert.equal(
    (await f.request(settings, "GET", null, otherId, { id })).status,
    404,
  );
  for (const input of [
    body({ confirmed: false }),
    body({ greeting: "x".repeat(301) }),
    body({ greeting: "bad\u0000text" }),
  ])
    assert.equal(
      (await f.request(settings, "POST", input, userId, { id })).status,
      400,
    );
  assert.equal(
    (await f.request(settings, "POST", body(), otherId, { id })).status,
    404,
  );
  assert.equal(
    (await f.request(settings, "POST", body(), userId, { id })).status,
    409,
  );
  const paid = await f.order({ paid: true });
  assert.equal(
    (await f.request(settings, "POST", body(), userId, { id: paid })).status,
    409,
  );
  assert.equal(
    (
      await f.request(
        settings,
        "POST",
        body({ greeting: "x".repeat(5000) }),
        userId,
        { id: paid },
      )
    ).status,
    413,
  );
});

test("gift capability reveals minimal metadata and audio; rotation and revocation invalidate old requests", async () => {
  const id = await f.order({ paid: true });
  await asset(id);
  assert.equal((await gifts().ownedGift(id, userId)).active, false);
  const enabled = await gifts().setGift(id, userId, body()),
    token = enabled.url.split("/").at(-1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const dto = await gifts().publicGift(token);
  assert.deepEqual(Object.keys(dto).sort(), ["greeting", "recipient", "title"]);
  assert.doesNotMatch(
    JSON.stringify(dto),
    /Private story|confirmed song|paypal|storage|owner@/,
  );
  let r = await f.request(audio, "GET", null, null, { token });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.match(r.headers.get("cache-control"), /private, no-store/);
  assert.equal(r.headers.get("location"), null);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), wav());
  r = await gifts().giftAudio(token, "bytes=5-13");
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-range"), "bytes 5-13/204");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), wav().subarray(5, 14));
  assert.equal((await gifts().giftAudio(token, "bytes=999-")).status, 416);
  const replacement = await gifts().setGift(id, userId, body());
  assert.notEqual(replacement.url, enabled.url);
  await assert.rejects(gifts().publicGift(token), (e) => e.status === 404);
  const newToken = replacement.url.split("/").at(-1);
  await gifts().setGift(id, userId, body({ active: false, confirmed: false }));
  await assert.rejects(gifts().publicGift(newToken), (e) => e.status === 404);
  assert.equal((await gifts().ownedGift(id, userId)).url, null);
});

test("revocation during storage download fails closed without a signed URL or audio body", async () => {
  const id = await f.order({ paid: true });
  await asset(id);
  let gift = await gifts().setGift(id, userId, body());
  let token = gift.url.split("/").at(-1);
  f.setFail({ storageDownload: true });
  await assert.rejects(gifts().giftAudio(token, null), (e) => e.status === 503);
  f.setFail({ revokeOnDownload: true });
  await assert.rejects(gifts().giftAudio(token, null), (e) => e.status === 404);
  assert.ok(
    f.calls
      .filter((c) => c.url?.includes("/storage/"))
      .every((c) => !c.url.includes("/sign/")),
  );
  f.setFail({});
  gift = await gifts().setGift(id, userId, body());
  token = gift.url.split("/").at(-1);
  await f.db.query("update song_orders set user_id=null where id=$1", [id]);
  await assert.rejects(gifts().publicGift(token), (e) => e.status === 404);
});

test("usage collection allows only coarse fields, configured campaigns and cookie identifiers", async () => {
  await assert.rejects(
    stats().saveUsage(new Request("http://localhost/"), usage()),
    (e) => e.status === 400,
  );
  for (const bad of [
    usage({ email: "private@example.com" }),
    usage({ first: "raw-private-host.example" }),
    usage({ page: "/lyrics/private-id" }),
    usage({ event: "payment_succeeded" }),
    usage({ eventKey: "forged" }),
  ])
    await assert.rejects(
      stats().saveUsage(usageRequest(), bad),
      (e) => e.status === 400,
    );
  f.env.SONGGIFT_ANALYTICS_CAMPAIGNS = "birthday_2026";
  const session = crypto.randomUUID(),
    request = usageRequest(session),
    event = usage({ campaign: "person@example.com" });
  await stats().saveUsage(request, event);
  await stats().saveUsage(request, event);
  let rows = (
    await f.db.query("select * from usage_events where session_id=$1", [
      session,
    ])
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].campaign, "");
  await stats().saveUsage(request, usage({ campaign: "birthday_2026" }));
  rows = (
    await f.db.query("select * from usage_events where session_id=$1", [
      session,
    ])
  ).rows;
  assert.equal(rows[1].campaign, "birthday_2026");
});

test("order attribution is owner-only, first assignment wins, and cannot invent Live payment facts", async () => {
  const id = await f.order(),
    sid = crypto.randomUUID(),
    session = usageRequest(sid);
  const file = "src/app/api/analytics/order/route.ts";
  const request = (owner, orderId = id) =>
    new Request("http://localhost/api/analytics/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "sg_usage=" + sid,
        "x-fixture-user": owner,
      },
      body: JSON.stringify({
        ...usage({ event: "lyrics_ready", page: "lyrics" }),
        orderId,
      }),
    });
  assert.equal((await f.load(file).POST(request(otherId))).status, 404);
  assert.equal((await f.load(file).POST(request(userId))).status, 200);
  await stats().saveUsage(
    usageRequest(),
    usage({ event: "checkout_started", page: "lyrics" }),
    { id, userId },
  );
  assert.equal(
    (
      await f.db.query(
        "select session_id from song_order_attribution where order_id=$1",
        [id],
      )
    ).rows[0].session_id,
    sid,
  );
  const report = await f.rpc("songgift_usage_report", {
    p_from: "2026-01-01T00:00:00Z",
    p_to: "2027-01-01T00:00:00Z",
  });
  assert.equal(report.captures, 0);
  assert.equal(report.attributedCaptures, 0);
  await stats().forgetUsage(session);
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from usage_events where session_id=$1",
        [sid],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from song_order_attribution where session_id=$1",
        [sid],
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    stats().saveUsage(
      session,
      usage({ event: "checkout_started", page: "lyrics" }),
      { id, userId },
    ),
    (e) => e.status === 429,
  );
  assert.equal(
    (
      await f.db.query("select count(*)::int n from song_orders where id=$1", [
        id,
      ])
    ).rows[0].n,
    1,
  );
});

test("usage limits bound repeat submissions; later collection removes expired events and source associations", async () => {
  const sid = crypto.randomUUID(),
    request = usageRequest(sid);
  for (let i = 0; i < 20; i++) await stats().saveUsage(request, usage());
  await assert.rejects(
    stats().saveUsage(request, usage()),
    (e) => e.status === 429,
  );
  const oldId = await f.order();
  await f.db.query(
    "insert into usage_events(session_id,event_key,event,page,first_source,last_source,medium,campaign,created_at) values($1,$2,'page_view','home','direct','direct','none','',now()-interval '31 days')",
    [crypto.randomUUID(), crypto.randomUUID()],
  );
  await f.db.query(
    "insert into song_order_attribution(order_id,session_id,created_at) values($1,$2,now()-interval '31 days')",
    [oldId, crypto.randomUUID()],
  );
  await stats().saveUsage(usageRequest(), usage());
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from usage_events where created_at<now()-interval '30 days'",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from song_order_attribution where order_id=$1",
        [oldId],
      )
    ).rows[0].n,
    0,
  );
});

test("audit list is filtered, paginated and stripped of extra capabilities; date windows are bounded", async () => {
  for (let i = 0; i < 22; i++)
    await f.db.query(
      "insert into admin_audit_logs(request_id,actor_user_id,action,target_type,target_id,order_id,result) values($1,$2,'audio.preview','song_asset',$3,$4,$5)",
      [
        crypto.randomUUID(),
        userId,
        crypto.randomUUID(),
        crypto.randomUUID(),
        i % 2 ? "issued" : "requested",
      ],
    );
  const work = f.load("src/lib/admin/workspace.ts");
  const filtered = await work.workspaceData(
    "audit",
    new URLSearchParams(
      "actor=" + userId + "&action=audio.preview&result=issued",
    ),
  );
  assert.equal(filtered.total, 11);
  assert.ok(filtered.rows.every((r) => r.result === "issued"));
  const paged = await work.workspaceData(
    "audit",
    new URLSearchParams("page=2"),
  );
  assert.equal(paged.rows.length, 2);
  assert.doesNotMatch(
    JSON.stringify(paged),
    /storage_path|request_id|lease_token/,
  );
  await assert.rejects(
    work.workspaceData(
      "analytics",
      new URLSearchParams("from=2026-01-01&to=2026-11-13"),
    ),
    (e) => e.status === 400,
  );
});

test("Live capture facts are independent of browser claims, source-linked, and duplicate-safe", async () => {
  const id = await f.order(),
    session = crypto.randomUUID();
  await stats().saveUsage(
    usageRequest(session),
    usage({ event: "checkout_started", page: "lyrics" }),
    { id, userId },
  );
  await f.rpc("prepare_songgift_checkout", {
    p_order_id: id,
    p_user_id: userId,
    p_amount_minor: 999,
    p_environment: "live",
    p_price_version: "isolated-live",
  });
  await f.rpc("bind_songgift_checkout", {
    p_order_id: id,
    p_user_id: userId,
    p_paypal_order_id: "PP-" + id,
  });
  const capture = {
    p_order_id: id,
    p_user_id: userId,
    p_paypal_order_id: "PP-" + id,
    p_capture_id: "CAP-" + id,
    p_environment: "live",
    p_amount_minor: 999,
    p_currency: "USD",
    p_occurred_at: new Date().toISOString(),
  };
  await f.rpc("record_songgift_capture", capture);
  await f.rpc("record_songgift_capture", capture);
  const result = await f.rpc("songgift_usage_report", {
    p_from: new Date(Date.now() - 3600000).toISOString(),
    p_to: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal(result.captures, 1);
  assert.equal(result.attributedCaptures, 1);
  assert.equal(
    result.attributedSources.find((r) => r.source === "google").captures,
    1,
  );
  assert.ok(result.lastSources.some((r) => r.source === "google"));
  assert.ok(Array.isArray(result.campaigns));
});

test("system health reports partial failures and configuration without calling payment, music or mail providers", async () => {
  f.env.PAYPAL_LIVE_CLIENT_SECRET = "PRIVATE secret never displayed";
  f.env.SONGGIFT_RELEASE_SHA = "abc12345678901234567890";
  const start = f.calls.length;
  f.setFail({ storage: true });
  const data = await f
    .load("src/lib/admin/workspace.ts")
    .workspaceData("system", new URLSearchParams());
  assert.equal(
    data.rows.find((r) => r.item === "私有音频存储").state,
    "查询失败",
  );
  assert.equal(data.rows.find((r) => r.item === "数据库").state, "连接成功");
  assert.equal(
    data.rows.find((r) => r.item === "部署版本").state,
    "abc123456789",
  );
  assert.doesNotMatch(
    JSON.stringify(data),
    /PRIVATE|isolated-service-role|lease_secret/,
  );
  assert.ok(
    f.calls
      .slice(start)
      .every((c) => new URL(c.url).hostname === "isolated.supabase.invalid"),
  );
});

test("withdrawal limits invented identifiers while existing analytics can always be removed", async () => {
  const id = crypto.randomUUID();
  await stats().saveUsage(usageRequest(id), usage());
  await f.db.query(
    "insert into usage_optouts(session_id) select gen_random_uuid() from generate_series(1,10000)",
  );
  await assert.rejects(
    stats().forgetUsage(usageRequest()),
    (e) => e.status === 503,
  );
  await stats().forgetUsage(usageRequest(id));
  await stats().forgetUsage(usageRequest(id));
  assert.equal(
    (
      await f.db.query(
        "select count(*)::int n from usage_events where session_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );
});

test("gift grants stay bound to their buyer and account deletion removes the capability permanently", async () => {
  const id = await f.order({ paid: true });
  await asset(id);
  const gift = await gifts().setGift(id, userId, body()),
    token = gift.url.split("/").at(-1);
  await f.db.query("update song_orders set user_id=$1 where id=$2", [
    otherId,
    id,
  ]);
  await assert.rejects(gifts().publicGift(token), (e) => e.status === 404);
  assert.equal((await gifts().ownedGift(id, otherId)).active, false);
  await f.db.exec("reset role");
  try {
    await f.db.query("delete from auth.users where id=$1", [userId]);
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from song_gifts where order_id=$1",
          [id],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await f.db.exec("set role service_role");
  }
  await assert.rejects(gifts().publicGift(token), (e) => e.status === 404);
});
