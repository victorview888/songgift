import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// In-memory PostgreSQL only: no production URL, Auth account or credentials.
const db = new PGlite();
const owner = "a3f10454-1234-4234-8234-012345678901";
const other = "b3f10454-1234-4234-8234-012345678902";
const migration = readFileSync("supabase/migrations/20261105_admin_permissions.sql", "utf8");
before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${owner}'), ('${other}');
    create table public.song_orders (id uuid primary key, user_id uuid);
    insert into public.song_orders values ('${owner}', '${owner}'), ('${other}', '${other}');
    alter table public.song_orders enable row level security;
    grant usage on schema public to anon, authenticated, service_role;
    grant select on public.song_orders to authenticated;
    create policy owners_only on public.song_orders for select to authenticated
      using (user_id = nullif(current_setting('test.user_id',true),'')::uuid);
  `);
  await db.exec(migration);
});
after(async () => { await db.close(); });

async function asRole(role, action) {
  assert.ok(["anon", "authenticated", "service_role"].includes(role));
  await db.exec(`set role ${role}`);
  try { return await action(); }
  finally { await db.exec("reset role"); }
}

test("migration is repeatable, starts empty and enables RLS", async () => {
  await db.exec(migration);
  const count = await db.query("select count(*)::int as total from public.admin_members");
  assert.equal(count.rows[0].total,0);
  const rls=await db.query("select relrowsecurity from pg_class where oid='public.admin_members'::regclass");
  assert.equal(rls.rows[0].relrowsecurity,true);
});

test("anonymous and ordinary authenticated roles cannot read or write membership",async()=>{
  for(const role of ["anon","authenticated"]) {
    for(const sql of ["select * from public.admin_members",`insert into public.admin_members(user_id) values ('${owner}')`,`update public.admin_members set active=true where user_id='${owner}'`,`delete from public.admin_members where user_id='${owner}'`]) {
      await asRole(role,async()=>{await assert.rejects(db.exec(sql),error=>error.code==="42501");});
    }
  }
  const rights=await db.query("select has_table_privilege('authenticated','public.admin_members','select,insert,update,delete') as can_access");
  assert.equal(rights.rows[0].can_access,false);
});

test("service role can grant and revoke only an existing account with a valid role",async()=>{
  await asRole("service_role",async()=>{
    await db.query("insert into public.admin_members(user_id) values ($1)",[owner]);
    const granted=await db.query("select role,active from public.admin_members where user_id=$1",[owner]);
    assert.deepEqual(granted.rows,[{role:"owner",active:true}]);
    await db.query("update public.admin_members set active=false where user_id=$1",[owner]);
    assert.equal((await db.query("select active from public.admin_members where user_id=$1",[owner])).rows[0].active,false);
    await assert.rejects(db.query("insert into public.admin_members(user_id,role) values ($1,'superuser')",[other]),error=>error.code==="23514");
    await assert.rejects(db.query("insert into public.admin_members(user_id) values ('c3f10454-1234-4234-8234-012345678903')"),error=>error.code==="23503");
  });
});

test("granting membership never changes customer order RLS",async()=>{
  await asRole("authenticated",async()=>{
    await db.exec(`set test.user_id='${owner}'`);
    const rows=await db.query("select id from public.song_orders order by id");
    assert.deepEqual(rows.rows,[{id:owner}]);
    await assert.rejects(db.query("select * from public.admin_members"),error=>error.code==="42501");
    await assert.rejects(db.query("update public.song_orders set user_id=$1 where id=$2",[owner,other]),error=>error.code==="42501");
  });
});
