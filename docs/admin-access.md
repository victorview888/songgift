# Administrator access

This is the permission foundation, not the seven-page admin console. `/admin`
shows only the verified administrator's own identity and the next development step.
Orders, paid generation, refunds and customer exports are not implemented here.

## Authorization boundary

- Existing Supabase email sign-in is reused. Signed-out `/admin` requests redirect
  to `/login?next=%2Fadmin`; an already signed-in user can follow the safe return link.
- `admin_members` identifies a verified Auth user by UUID. Only an active `owner`
  qualifies. Email, `user_metadata`, browser state, and JWT role claims grant nothing.
- `requireAdmin` checks membership on every request, without a role cache. Revoke
  `active` and the next protected request is denied, including existing sessions.
- Every admin API must call `adminRoute` before business queries. It preserves
  the existing same-origin/JSON write checks, HttpOnly cookies and private/no-store.
- Every server-rendered admin page must await `getAdminPageAccess` before reading
  privileged data. A layout-only check does not protect child data fetching.
- `/api/admin/session`: 401 when unsigned/unverified, 403 when not an active Owner,
  503 on unavailable membership configuration, 200 with a minimal own-identity DTO.
- Ordinary users see a generic 404 access page, not the administrator shell. A
  temporary authorization outage shows no privileged data. Metadata is noindex and
  robots.txt excludes `/admin`; these are indexing controls, not authorization.
- Service-role credentials stay server-side. Ordinary Data API users cannot read
  or mutate `admin_members`; this migration changes no existing order RLS.

Server Components only read cookies. The existing account session route refreshes
cookies in its HTTP response; admin API requests do the same through `authRoute`.

## Migration and initial owner

1. Apply `supabase/migrations/20261105_admin_permissions.sql` to the intended
   Supabase project. It creates an empty membership table and grants no users access.
   `supabase/schema.sql` includes the same schema for a fresh installation.
2. Obtain the exact UUID of the intended active, email-verified Auth account.
3. With Node 24, run the operator tool from the repository root, first as a dry run:

       node --env-file=.env.local scripts/grant-admin-owner.mjs --user-id <uuid> --expected-project <project-ref>

   Verify the target project, user UUID, and verified email. Only then append
   `--apply` to that exact command. Creating a production Owner grants privileged
   access and must be explicitly approved before execution.
4. Open `/admin`, sign in using the same verified account, and check the Owner card.

The tool does not create an Auth account, generate login tokens, send email, or
print keys. It refuses a mismatched project or unverified/deleted/banned account.
No public bootstrap or role-editing endpoint exists.

Revoke a specific member with a controlled SQL operation:

    update public.admin_members
    set active = false, updated_at = now()
    where user_id = '<exact-user-uuid>';

A service operator can restore access through the same reviewed grant tool. Do
not change customer metadata or disable existing RLS to recover admin access.

## Checks

Run `npm run test:admin`, the existing provider/payment tests, `npm run lint`,
`npm run build`, and `npm run build:vinext`. The migration tests use in-memory
PostgreSQL (PGlite); Auth and membership transport responses in the unit tests
are controlled fixtures. No tests grant production access.

## Isolated runtime and browser checks

`scripts/test-admin-runtime.mjs serve` starts a loopback-only Auth/PostgREST test
transport with an in-memory PostgreSQL membership table. The two accounts are
`owner@admin-test.example` and `customer@admin-test.example`, with test-only code
`123456`. This simulates Auth transport; it does not validate real SMTP delivery.

Run a production Next preview on port 3002 with SUPABASE_URL set to
`http://127.0.0.1:54329`, SUPABASE_PUBLISHABLE_KEY to `isolated-public-key`, and
SUPABASE_SERVICE_ROLE_KEY to `isolated-service-role`. Override these process env
values explicitly; do not modify real credentials. Then run:

    node scripts/test-admin-runtime.mjs test

The default site is `http://localhost:3002`, matching Next.js loopback URL
normalization for same-origin writes. Workers can be tested by setting
SONGGIFT_ADMIN_TEST_URL to a loopback Workers URL. Use a separate Wrangler config
and fake-only .dev.vars so no production services are contacted. External target
URLs are refused. The fixture control endpoints exist only in this operator
script, never in the production app routes.

Checks cover signed-out redirects, ordinary users with forged admin metadata,
Owner SSR, private cache headers, noindex, live revocation, missing membership
schema, sign-out and robots. Stop both the site and fixture processes afterwards.
