# SongGift SEO audit and rollout plan

Primary site: https://www.songforalways.com. The public site is in English and targets people looking for personalized song gifts. Keep the apex-to-www redirect in place so search engines see one host.

## Findings

Before this change, the home page had one generic title and description inherited by every route. There were no canonical URLs, XML sitemap, robots.txt, or social-sharing metadata. The occasion cards all led to the creation form, leaving no public page that answered a birthday, wedding, or anniversary search. Login, library, and order pages also lacked explicit `noindex` directives. The existing `<html lang="en">` and visible heading hierarchy were already useful foundations.

## Priority 1 — implemented in this branch

1. Give the home and creation pages unique titles, descriptions, canonical URLs, and Open Graph/Twitter text. Add a `WebSite` schema to the home page.
2. Publish `/robots.txt` and `/sitemap.xml` from Next.js metadata routes. Include only public, indexable pages in the sitemap. Allow crawlers to reach private UI routes so they can read their `noindex` directives; disallow API and auth callback routes.
3. Add `noindex, nofollow` to login, My Songs, lyrics, and finished-song pages. Those routes contain personal or order-specific information and should not appear in search results.
4. Create distinct, useful English pages for birthday, wedding, and anniversary songs. Each page gives occasion-specific writing prompts, explains the real review-and-payment flow, has its own canonical and metadata, and links to the creation form and related occasions. The home page now links to them. Add breadcrumb structured data.

## Priority 2 — after deployment

1. Verify the production HTTP output for `/`, `/create`, all three occasion pages, `/robots.txt`, and `/sitemap.xml`. Check page source for canonical, description, social metadata, structured data, and `noindex` on login and order routes. Confirm unknown occasion slugs return 404.
2. Add the sitemap to Google Search Console and Bing Webmaster Tools. Verify the `www` property and inspect indexing after search engines crawl it. The site owner must use the account that controls these properties.
3. Measure mobile Core Web Vitals and indexing with real traffic. Prioritize any failing LCP, INP, or CLS metric before adding more pages. Record baseline and follow-up metrics rather than assuming the changes improve rankings immediately.

## Priority 3 — content expansion

Add family, pet, remembrance, and other occasion pages only when each has its own useful guidance and examples. Create a branded 1200×630 social image and set `og:image`/Twitter image metadata when the final visual is ready. Review search queries and conversions to decide which pages to expand; avoid publishing near-duplicate keyword pages.

This branch is separate from the PayPal Live configuration branch. Merging it to `master` will trigger the existing Cloudflare deployment workflow. Production validation and Search Console submission remain to be done after deployment.
