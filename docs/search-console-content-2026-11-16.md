# Public content and crawl signals — 2026-11-16

Based on production `852bbf6`, branch `codex/search-indexing-review`. Public pages were reachable and index-eligible before this change. These improvements fix real content/interaction issues and give crawlers accurate update information; they do not establish that Google has indexed a page.

## Resulting behavior

- The Terms and Privacy effective dates now come from their configured values. Previously the visible label was hardcoded to 10 November although the machine-readable date was 15 November. Contract text and configured effective dates are unchanged.
- Wedding, anniversary, birthday and memorial calls to action preselect their existing form occasion, as holiday links already did. Query parameters are allowlisted; they cannot supply stories or recipient data. Existing partial drafts and saved orders retain their original inputs; only explicitly starting a new story applies a different preset.
- The lyric-review guide includes a clearly labelled fictional before/after example and the save/preview/purchase sequence. The giving guide explains the actual gift controls, testing a signed-out link, replacing/revoking links and keeping an independent downloaded backup.
- Pricing describes an available free excerpt followed by unlocking the same full recording. Help includes gift-link instructions and navigable topics. A new wedding checklist covers testing the full song and event playback. These pages link to relevant guides and approved public demos.
- The homepage directly links to both practical guides. Article metadata includes genuine publication dates from their first release on 13 November, explicit revision dates for edited guides, an existing brand image and organization attribution. Visible dates match those fields.
- The sitemap still lists the same 23 public canonical URLs. Known content revisions receive fixed `lastmod` dates from `src/lib/content-dates.ts`; untouched pages without a known date omit it. Dates never advance just because a build or request runs. Update the registry only after meaningful visible content or flow changes.

The existing private/form `noindex` directives, API/authorization boundaries and permanent production-host redirects are retained. No database migration, new audio submission, payment or mail action is involved. Public pricing and saved-order quotes are unchanged.

## Acceptance

- Unit coverage includes preset allowlists, future-clock stability of content dates, holiday rollover and existing draft/owner recovery.
- `scripts/test-seo-runtime.mjs` checks all 23 public routes, private-page exclusions, canonical URLs, structured data, sitemap membership, visible/legal dates, homepage guide discovery and current occasion links on both Next and the compiled Workers runtime.
- `scripts/test-holidays-browser.mjs` covers holiday/wedding presets, partial-draft preservation, explicit new-story behavior, guest-to-login continuity and unknown query values at 1440/390/320px. Every business API is isolated.
- The existing free-preview browser acceptance remains part of validation. Public content also receives viewport checks for reading, anchors and overflow.

Executed before merge: 16 unit/draft checks passed; Next and compiled workerd each passed 59 SEO checks and 21 public page/viewport checks. The isolated occasion/draft and free-preview browser runs each passed 18 checks at 1440/390/320px. TypeScript, changed-file ESLint and the Workers build passed. Production activation still requires confirming the merged revision on the live health endpoint.

## Google-side follow-up

Check the current canonical URL in Search Console's URL Inspection, its selected canonical and last crawl, then use the live test. A real content update can warrant requesting reindexing. Normal HTTP/apex aliases, private pages and an icon resource need no forced HTML indexing. Redirects and private `noindex` classifications can remain in the report as intended.

No Search Console validation or indexing request has been submitted by this implementation. The session currently has no connected authenticated account for those actions. Google's indexing choice and report refresh are separate from deploying the site improvements. Do not use the restricted Indexing API for ordinary song pages or pretend a sitemap fetch submits an authenticated indexing request.

References: [Page indexing report](https://support.google.com/webmasters/answer/7440203), [Sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article).
