# Gifting imagery and photographic home page

Implemented 18 November 2026 after reviewing https://songgift.co/ as the user's primary visual reference. The reference uses a large lifestyle photograph, a dark overlay with white headline, a prominent warm CTA, centered section headings and rounded occasion-photo cards. We adapt those layout principles to songforalways's existing brand, song workflow and public pages.

Nine original illustrative scenes were generated with OpenAI image generation: anniversary/shared listening, birthday, wedding, family, pet, memorial, Christmas traditions, Christmas Eve and New Year. They are not customer photographs or testimonials. The warm cream/terracotta palette connects them to the existing identity. No competitor image, logo, testimonial, media endorsement, price or delivery promise is reused.

The source files are `design/gifting/*.png`. Run `node scripts/build-gifting-assets.mjs` to create 480, 960 and 1440 pixel WebP variants. `design/gifting/manifest.json` records original hashes, output dimensions and byte sizes. The generated originals remain available independently of these exported versions.

`GiftingImage` emits a responsive static `srcset`, explicit dimensions, asynchronous decoding and native lazy loading. Only each page's leading scene loads eagerly at high priority. Prebuilt WebP avoids dependence on an external image host or runtime transformation service on Workers. Captions and alt text identify scenes as AI illustrations. Text and controls remain real HTML, and the three sample players continue using the existing public audio.

Images appear in the home hero, six occasion links, sample-card covers, the nine-item occasion directory and each occasion guide. Christmas, Christmas Eve and New Year have distinct scenes. Editorial sitemap dates advance only for the public pages visually changed in this release. Guide article dates and policy effective dates retain their existing values.
