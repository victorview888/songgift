# Administrator access

The console currently includes server-verified Owner access, a read-only order
list and read-only order details. Paid generation, payment reconciliation, refunds
and exports are not administrator actions in this implementation.

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

## Read-only order list

`/admin/orders` checks `getAdminPageAccess` before querying orders;
`GET /api/admin/orders` enters through `adminRoute` before parsing filters or
querying customer data. Membership revocation and unavailable configuration keep
the existing fail-closed behavior. There are no order mutation endpoints in this
feature, no new production migration and no automatic Owner grants.

The page and API share `src/lib/admin/orders.ts`. Query parameters:

| Parameter | Values / meaning |
| --- | --- |
| `searchBy`, `q` | `id` (default), `email`, `paypal`; full exact value. Email is case-insensitive; `%`, `_` and backslashes are escaped, not treated as wildcards. Email is the order's recorded email, not a live Auth profile lookup. |
| `from`, `to` | `YYYY-MM-DD` creation dates in Asia/Shanghai (UTC+8), both dates inclusive; converted to a UTC half-open interval. |
| `payment` | `all`, `recorded` (`paid_at` exists), `unrecorded` (`paid_at` absent). This is local evidence, not PayPal reconciliation. |
| `delivery` | `all`, `delivered` (final asset exists), `undelivered` (none), `generating` / `failed` (raw status plus no final asset). Asset existence does not probe Storage or prove email delivery. |
| `provider` | Recorded music provider: `fal`, `musicapi`, `mureka_cn`, `google_lyria`, `mock`; omitted means all. |
| `page` | Positive integer, maximum 999999, default 1. Fixed 20-row server pagination, ordered by `created_at DESC, id DESC`, with exact filtered count. |

Filters are combined on the server before pagination. Invalid or duplicate known
parameters return API 400; the page shows a recoverable error. Empty and
out-of-range pages show an empty state and a first-page link. Pagination preserves
filters; submitting the filter form starts at page 1. Search values appear in the
URL, so avoid sharing search URLs containing customer email addresses.

The summary response omits full stories, lyrics, generation errors, storage paths
and signed audio URLs. It does not infer historical prices or payment environment
from today's configuration; the page labels them as unrecorded. Order details,
mutations, exports and payment reconciliation remain future work. The customer
order API and RLS are unchanged.

`npm run test:admin` includes query validation, real Supabase client URL encoding,
summary-only projection, date boundaries, relation filters and order API access
checks. `scripts/test-admin-runtime.mjs test` additionally checks the orders page
and API with isolated Auth sessions and 25 synthetic orders: filters, exact email
search, server pagination, noindex, private responses and revoked membership. The
transport simulates PostgREST; it is not a production Supabase acceptance test.


## Read-only details and protected audio

- `/admin/orders/[id]` verifies current membership on the server before reading
  the order. `GET /api/admin/orders/[id]` uses `adminRoute` and returns 404 for an
  invalid or missing ID, 503 for a failed read. It never signs audio or calls a
  payment/model provider. Asset metadata omits buckets, paths and signed URLs.
- The detail page includes recorded story, lyrics, user/order identifiers, local
  payment timestamps, the latest provider/model/job reference, and asset metadata.
  Story and lyrics render as text. Missing amounts, currency, payment environment,
  capture/refund evidence and full job/event history are labeled as unavailable.
- The latest 100 assets are shown; truncation is explicit. Delivery evidence is
  checked independently, so an older final asset is not hidden by this limit.
  The timeline is derived only from creation, local `paid_at` and asset timestamps.
- A `back` parameter may preserve the order list's filters/page. It is restricted
  to the local `/admin/orders` path. No customer URL or arbitrary redirect is used.
- `GET /api/admin/orders/[id]/audio/[assetId]` rechecks membership, binds both IDs
  and `is_final=true`, then records the access before issuing a 60-second link.
  `download=1` changes the download disposition and audit action. Invalid modes
  return 400; unrelated/non-final/missing assets return 404. Responses remain
  private/no-store and redirects set `Referrer-Policy: no-referrer`.
- Playback uses `preload="none"`; opening/prefetching a detail page does not sign
  links. Once issued, a bearer link remains usable for up to 60 seconds even if
  membership is revoked; new requests are denied immediately. Audit records show
  link issuance, not proof of listening or completed downloads.

Before production audio access, review and apply
`supabase/migrations/20261105_admin_audio_audit.sql` after the original membership
migration. It creates the minimum `admin_audit_logs` table for audio access only;
this is not the full operations audit system. There are no automatic grants,
customer RLS changes or business data backfills. The schema is also included in
`supabase/schema.sql` for new installations. No production migration was executed
as part of development.

Audit rows include only actor/request/order/asset IDs, action, issuance result and
creation time. They contain no story, email, object path, token, signed URL, headers
or raw provider error. Customer roles have no access. Service role can insert/read
and update only `result`; it cannot change identity fields or delete rows through
these grants. Audit insert failure prevents signing; failure to persist issuance
prevents the redirect. An interrupted request can remain `requested`. Missing
audit configuration disables audio access without blocking the read-only details.

Template provenance and MIT notices: `docs/admin-template-migration.md` and
`third-party/shrimpreel/LICENSE`. Querying a page remains server-rendered; the
client request hook and payment mutation controls were not migrated.

The expanded isolated checks exercise details, text escaping, preserved list
context, ordinary-user and revoked-session rejection, bound audio access, audit
failure, short-lived redirects and capability-free detail responses. The fixture
uses in-memory PostgreSQL for membership/audit and simulated order/Storage APIs;
it does not validate real production files or real Supabase storage signing.

## Order operations foundation

`20261105_order_operations.sql` adds nullable immutable quote fields, append-only
payment transactions and order events, generation attempt/lease state, a unique
final asset per new job, and structured administrator operation audit. The
service-only primitives live in `src/lib/services/order-operations.ts`.

This stage does not yet replace the existing customer checkout, capture,
generation or audio-persistence routes. No administrator mutation buttons or
provider calls were added. Integrate those entry points through the primitives
and validate them together before enabling the full workflow.

`GET /api/admin/orders/[id]/history` rechecks administrator membership and returns
only the quote and latest 50 records of each history category. No lease token,
submission key, raw provider response, Storage path or signed URL is returned.
The detail page uses this reader; when the new schema is unavailable it displays
that the processing history is unavailable and retains the existing details.
Legacy amounts and task history are not inferred or backfilled.

Migration ordering, RPC contracts, idempotency, unknown submissions and the next
integration steps are documented in `docs/order-operations.md`. The expanded
in-memory PostgreSQL tests exercise the actual migration and transaction
functions. HTTP runtime checks simulate financial/job records; they are not proof
of real PayPal captures, real task execution or production migration readiness.
