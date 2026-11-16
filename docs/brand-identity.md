# songforalways identity

The public brand is **songforalways**, matching `songforalways.com`. The descriptor is “Personalized AI song gifts”. The operator and existing service policies remain the same; this display-name change does not change their terms or effective dates.

The terracotta mark combines a musical note, an infinity loop and a heart to suggest a song kept with a meaningful memory. It was designed with OpenAI image generation on 16 November 2026. The final transparent source is `design/brand/songforalways-mark.png`; no third-party template logo is used.

Run `node scripts/build-brand-assets.mjs` to package the source as a small header mark, organization icon, Apple touch icon, favicon, transparent logo/wordmark and 1200 × 630 social card. The SVG logo embeds the raster mark; it is not a fully vectorized illustration. Previously published `songgift-*` asset URLs are retained for compatibility.

`src/lib/brand.ts` and `src/components/brand.tsx` define the shared identity for public, gift and admin screens. Headers use real text beside a decorative image for accessible, legible branding.

One global footer replaces the former stacked home/occasion and legal footers. Public pages show three navigation groups; account and song workflows show compact help and policy links. Gift pages omit analytics preferences, and admin pages keep their own navigation. The existing analytics-preferences event is unchanged.

Infrastructure, database/RPC names, environment-variable names, draft storage keys, analytics event names, repository/package names and payment idempotency keys retain `songgift` to preserve existing orders, drafts, sessions and deployments. Only the PayPal display brand and new notification subject use the new public name; existing transactions and external authentication email templates are not rewritten.
