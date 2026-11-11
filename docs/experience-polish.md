# Customer experience and admin efficiency

This branch implements U01–U05 from the 2026-11-10 UI audit, using the released master source tree (`f51f021`). The existing permissions, payment checks, generation leases and delivery rules continue to govern operations. No SQL migration is required.

## Customer journey

- A successful focus-time session check keeps the same account object when identity is unchanged. A transient service/network failure shows a retry banner and preserves work; initial checks remain pending until a definite result. Both session and protected API handlers return retryable 503 responses for temporary Auth failures. Explicit missing/invalid sessions still lose access.
- Lyric editing is scoped to the account and order. Navigation warns about unsaved edits. A validated 24-hour, tab-local backup restores edits only if their original server lyrics still match. Successful save removes the backup; existing logout cleanup removes all `songgift-` draft keys. Client drafts never authorize access or confirm payment.
- The song library uses the existing owner/path-bound resource hook, aborts obsolete requests, and ignores old responses. Polling includes tasks requiring review.
- PayPal capture confirmation updates local paid state before starting generation. A generation error subsequently offers continuation instead of suggesting another payment. All actual authorization still happens on the server.
- OTP submission, resend and email switching are locked while requests are pending.
- Generation pages display the recorded phase and last check time. Temporary query failures have at most three bounded retries per check cycle; manual checking never submits a new generation. Review and failed states stop automatic polling.
- A shared native audio player supports load failure, reload, order help and guarded download with a readable error. Successful downloads are validated as audio and retain their format extension. Library cards link to the song page for download handling.

## Visual system

`src/app/experience.css` defines the shared customer rhythm after the existing base/account/legal styles. It scopes customer layout changes and leaves administrator styles in `admin.css`. It standardizes headings, 16px body copy, auxiliary text, touch targets, cards, focus behavior and reduced motion.

The homepage has a concise hero, responsive menu, colored occasion cards and shorter content sequence. Story input is grouped around the recipient, memories and music direction. Lyrics use an editor and checkout summary on desktop and stack on phones, with Save lyrics before checkout. Playback moves above secondary order details, and phone covers are smaller. Support navigation groups links and identifies the current page.

Public pricing, Terms, Privacy, Content Standards and report entry points remain present. The contact form continues to prepare a draft, rather than claiming it sent mail.

## Public sample audio

Set `SONGGIFT_PUBLIC_SAMPLES` to a JSON array with up to three objects:

```json
[{"title":"A song title","occasion":"Anniversary","style":"Acoustic pop","url":"https://your-public-media.example/sample.mp3"}]
```

The URL must be HTTPS or a filename beneath `/samples/`. Use operator-approved public media. The application does not automatically expose private customer songs, invoke a paid music provider, or ship fabricated music. Without valid configured media, the section and listening CTA are hidden and the hero offers “See how it works”. Samples load only on interaction, report errors and pause other samples when played. Local test WAVs are fixtures and must not be published as marketing songs.

## Administrator workspace

- One bounded list query includes quotes and at most two capture summaries per order, without N+1 reads or raw provider payloads. One valid capture displays its recorded amount/provider/environment. An unpaid quote is explicitly a quote. Paid historical orders without captures remain unverified; multiple captures require review and are not added together.
- Quick order filters retain other search criteria. Advanced fields and technical IDs are expandable; full IDs can be copied with a manual fallback.
- The task page defaults to recorded/current tasks while historical order references remain separately accessible. The API's historical default is preserved for compatibility. Semantic state badges include review, storage, progress and failure.
- Order history and notification records load independently in parallel after the main order succeeds. Either can fail without concealing basic order details.
- Report descriptions and review forms are expandable. Existing decisions initialize the review selector instead of resetting to “reviewing”.

## Validation and release

Use `node scripts/test-experience-browser.mjs` with `SONGGIFT_UI_URL` pointing to a loopback website. It blocks customer business requests with browser fixtures, verifies the reported regressions at 1440/768/390/320px, exercises a valid WAV and download, and uses the isolated admin transport for SSR screenshots. `scripts/test-admin-runtime.mjs` includes temporary Auth service outage/recovery checks.

This is an application/UI release. It does not activate Waffo, change refunds, authorize paid generation tests, or deploy the independent delivery/notification Worker. Public samples require approved media configuration. Real closed-browser delivery and mail arrival remain service-level acceptance checks, independent of these browser fixtures.

T06, T08, T09 and T10 remain paused. The Waffo draft's payment-option error/loading/retry fix is maintained separately; its integration still needs synchronization with the released legal/pricing/UI work before deployment.
