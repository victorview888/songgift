# Free audio preview and original homepage demos

Implementation date: 2026-11-15. Branch: `codex/free-song-preview`, based on production `bdf7faf`. Migration: `20261115140948_free_song_audio_preview.sql` (created using Supabase CLI v3.1.0).

## Offer and cost controls

- One free audio creation per account with a verified email, across devices and sign-ins. Replaying an existing excerpt does not consume another allowance.
- Up to 60 seconds from the original recording. Short recordings receive a shorter excerpt so the entire recording is not served before purchase.
- Initial global budget: 10 free audio submissions per UTC day, configured by `SONGGIFT_AUDIO_PREVIEW_DAILY_LIMIT` (1–100). This is an audio-generation budget, not a cap on paid orders or all lyric/safety calls.
- `SONGGIFT_AUDIO_PREVIEW_ENABLED` controls new customer starts. Existing preview recordings remain readable and purchasable in the new code when starts are paused.
- A confirmed provider rejection/failure restores the account allowance. Daily submission counts still apply, and an order has at most three explicit technical retries. Uncertain submission retains its reservation and is never automatically submitted again.
- A new style/lyric remake is another recording, not unlimited free regeneration. The normal pay-before-generation flow remains available for a new order after the free allowance is used.

The existing single-song price, server quote locking and verified payment ledger are unchanged. No credits, subscription or automatic add-on charges were introduced.

## Recording and purchase

The server reserves a private preview record and freezes approved lyrics before the external model call. Provider/model identity, request reference, state and leases are persisted. Repeated clicks/polls reuse the same request. A lost submission response goes to review rather than creating a second billable task.

Both the full original and a separately encoded excerpt live in the existing private Storage bucket. MP3 frames are cut on the server and duration/seek metadata is rewritten; PCM WAV has a rewritten header/data length. Unsupported or corrupt audio fails closed. Neither a client playback timer nor an exposed full-file URL is used as the preview boundary. Byte ranges only address the actual excerpt file.

The full original is hashed and recoverable after an interrupted excerpt upload or an expired provider download. Unpaid preview files are not customer-visible final `song_assets`. Purchase requires a matching verified capture, then promotes that same stored full recording without another music call or a new musical version. A database insert guard stops old code from submitting another recording for a preview order.

Lyrics are frozen while the recording is active/ready. The UI saves edits before reservation, shows the approved words after reservation, preserves valid local backup text separately, and disables checkout for an unfinished/failed preview. Existing payment returns can still be reconciled; a paid but unfinished original is retained for recovery rather than charged again.

## Permissions and recovery

The four new tables and mutation RPCs are service-only, with RLS enabled and no anonymous/customer grants. Customer routes reuse verified `authRoute` and order ownership. No service key, provider URL, full Storage path or full-file signed URL appears in the preview JSON. Public customer gift sharing continues to require a paid final asset.

Browser polling and scheduled maintenance only query/cache the original request. The independent maintenance Worker needs its own current deployment, feature setting and provider credentials; the site does not infer its operation from the main Worker configuration. A saved request can be resumed when the customer returns. Song-ready email delivery is a separate existing operational configuration.

Pause new starts using the feature flag while retaining this code and migration to honour existing purchases. Do not delete preview records/files as a rollback. The migration's generation guard prevents duplicate paid submission by older code, but an older application will not provide the new purchase/unlock experience.

## Three original public demos

The demos use fictional stories and original lyrics: Birthday, Anniversary and Christmas. They use the same production fal Lyria 3 Pro adapter as customer songs. Production already holds the provider credential; it need not be extracted or copied to the development environment.

An active Owner can reserve exactly one batch of three fixed demo slugs through the service-only `reserve_songgift_demo_samples` RPC. It stores a hash of a random 32-byte, 24-hour operation token. `/api/internal/demo-samples` accepts that scoped token to advance only those existing, fixed tasks. It cannot accept arbitrary prompts, create orders or grant customer allowances. Owner status is rechecked; submission claims are atomic. The raw token belongs outside Git/chat and is removed after release.

Only `kind=sample`, `state=ready`, `is_public=true` rows appear on the homepage. The sample route serves the excerpt, never a customer recording or the private full file. The site labels these as original AI demos with fictional stories. Explicit operator-configured approved media still takes precedence.

## Verification

- `tests/audio-preview.test.mjs`: quota/idempotence, ownership/RLS, failure recovery, matching-capture promotion, no duplicate model submission, and scoped demo authorization.
- `tests/audio-preview-clip.test.mjs`: actual FFmpeg decoding of CBR/VBR/low-rate MP3, WAV headers, short-song excerpts, corrupt sources and range bounds. FFmpeg is a test-only tool; production clipping has no binary dependency.
- `scripts/test-audio-preview-browser.mjs`: 1440/390/320px, save-before-preview, locked words, replay/reload, used allowance, same-recording checkout and valid backup retention. Business APIs are isolated fixtures.
- The existing payment, permissions, delivery, SEO and holiday suites remain part of release validation.

Production activation, generation of the three real demos and live validation must be recorded in the release/PR results; prepared code or synthetic test WAVs do not prove those steps succeeded.

## Runtime recovery verified on 2026-11-16

Cloudflare Workers rejects `redirect: "error"` before an audio download starts. The shared downloader now uses `manual` and rejects non-success/redirect responses without following them. `tests/audio-preview-worker.test.mjs` runs the actual downloader, clipper and range response in workerd; its native Request constructor catches the difference that Node-only tests missed. A cached original can also be saved when provider status polling is unavailable.

fal may report `COMPLETED` without an error field and then return 422 from its result endpoint for a failed execution. Only that combination is treated as a confirmed failure; failed status lookups, authentication errors and unavailable results retain the original request. No new recording is automatically submitted.

Bounded provider error messages omit echoed input and URLs. They are available only through the expiring, Owner-scoped operation for original marketing samples. Customer responses retain curated summaries and omit these internal diagnostics. Any retry of a confirmed failed public demo is a separate bounded operation; pending or uncertain tasks are never reset for resubmission.

The production feature and recovery fixes were merged in PRs #15–17. The original public demos are now ready: **A Birthday to Remember**, **Two Cups, One Table**, and **The Orange Cake Call**, at `/api/samples/birthday-demo/audio`, `/api/samples/anniversary-demo/audio`, and `/api/samples/christmas-demo/audio`. Anniversary/Christmas lyrics were rewritten after confirmed provider content-check failures; no customer material was used. Each published excerpt decodes to 59.898776 seconds, supports valid byte ranges, and rejects ranges beyond the excerpt. Full originals remain in the private `songs` bucket.

The final related regression run passed 77 tests. The actual production homepage passed browser checks at 1440, 390 and 320 pixels for all three real audio players, metadata/duration, playback, pausing other players and layout overflow. No real payment was charged during acceptance; matching-capture promotion and reuse of the original recording are covered by isolated tests.
