# Song FAQ content and presentation

Reviewed on 23 November 2026. The homepage now presents 12 questions in four groups; Help presents 23 when the free-audio offer is enabled, or 21 when it is disabled. Native HTML details remain usable without JavaScript. Topic links, a shared answer component and a support link make it easier to find the next action.

## Reference sites

- [SongGift](https://songgift.co/): ordering, price, delivery, song use and revisions informed the topic checklist. Its homepage also informed the requested translucent dark photo overlay.
- [GiftSong](https://www.giftsong.ai/): preview, account access, storage and gift sharing informed the topic checklist.
- [Songlorious](https://www.songlorious.com/faq): grouped questions, lyric approval and post-order help informed the organization.

The answers are written for songforalways, using its existing features and policies. Competitor prices, delivery deadlines, human-artist services, file-format bundles and revision allowances are not service commitments for this site.

## Sources of product facts

- `src/lib/song-faqs.ts` supplies the shared homepage/Help answers. Both pages pass the public price from `publicSongPriceUsd()` and the availability setting from `audioPreviewEnabled()`.
- `src/app/pricing/page.tsx` and `src/components/song-price.tsx` describe one-time USD/PayPal payment, included audio and the same-recording preview purchase.
- `src/lib/legal/documents.ts` supplies the existing privacy, personal-use, storage and case-by-case payment/delivery remedies. The FAQ does not change these policies.
- Existing Help instructions retain draft recovery, email-code sign-in, payment discrepancy handling and private gift-link controls.

The free audio allowance is once per verified account, subject to availability. Replays use the same excerpt; purchase unlocks that recording. Starting music freezes the approved lyrics. A requested remake is a separate recording, and a support request is not automatic refund approval. Purchased audio currently has no scheduled expiry; a local backup is recommended.

Only the homepage and Help modification dates advance to 23 November. Other article and policy dates keep their existing values. The existing approved hero image and responsive assets are retained; a uniform translucent black overlay replaces the previous stronger horizontal gradient. Text and buttons retain full opacity, and the mobile photo crop and fade continue to show both people.
