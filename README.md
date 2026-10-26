This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## MusicAPI.ai free-credit testing

The default music adapter uses MusicAPI.ai Sonic. Sign up at https://musicapi.ai/, create an API key, and put it in `.env.local` as `MUSICAPI_KEY`. Free signup credits are attached to the MusicAPI.ai account, not to this codebase. Keep the key server-side.

```env
MUSIC_PROVIDER=musicapi
MUSICAPI_KEY=your_server_side_key
MUSICAPI_BASE_URL=https://api.musicapi.ai/api/v1
MUSICAPI_MODEL=sonic-v5
```

MusicAPI.ai's Sonic create endpoint always generates two versions and charges for a two-song generation. It has no `n: 1` option. SongGift selects the first playable version, stores that single audio file in Supabase, and shows only that song to the customer. The other version is not persisted. Set `MUSIC_PROVIDER=mureka` to switch back to the retained Mureka integration, which requests one song with `n: 1`.

## DeepSeek lyrics access

The default lyrics adapter uses `deepseek-flash`. Create an API key in the [DeepSeek platform](https://platform.deepseek.com/), then add these server-side values to `.env.local`:

```env
LYRICS_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_server_side_key
DEEPSEEK_MODEL=deepseek-flash
```

DeepSeek charges for API usage from your account balance or promotional credit. Restart `npm run dev` after updating `.env.local`. `/api/health` reports `lyricsProvider` and `hasDeepSeekKey`; the key itself is never sent to the browser.

## PayPal checkout and email delivery

Song generation is gated by PayPal when `PAYPAL_REQUIRED=true` (the default). Create a PayPal REST app in Sandbox for testing and set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox`, and `SONG_PRICE_USD`. The checkout return URL is derived from the current site URL unless `PAYPAL_RETURN_URL` and `PAYPAL_CANCEL_URL` are set explicitly. Run the additions in `supabase/schema.sql` to add the payment columns to `song_orders`.

When a completed song is saved, SongGift sends the signed audio link to the order email through Resend. Set `RESEND_API_KEY` and `SONGGIFT_FROM_EMAIL` to enable delivery. Email failures are reported in the API response without discarding the saved audio.

## Optional Gemini lyrics access

Set `LYRICS_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.8-flash`, and a Gemini API key from Google AI Studio. If `/api/lyrics` returns `503` saying the key's project is restricted, inspect that project's status in AI Studio and contact Google support to restore access. Creating another key under the same restricted project will not resolve the `403` response. This project restriction does not affect the MusicAPI.ai adapter.

## Switching back to Mureka

The production music provider is selected with `MUSIC_PROVIDER`. The retained Mureka China adapter can be selected with:

```env
MUSIC_PROVIDER=mureka
MUREKA_API_KEY=your_server_side_key
MUREKA_API_BASE_URL=https://api.mureka.cn
MUREKA_MODEL=auto
```

Create the key in the Mureka API platform and keep it in `.env.local` or Vercel server-side environment variables. The browser never receives this key. Song creation returns an asynchronous task; the result page polls the task, downloads the provider's temporary audio URL on the server, and stores the final file in Supabase Storage when Supabase is configured.

The lyrics-to-song request sets `n: 1`, so Mureka generates and bills for one complete vocal song per request. The song includes its musical accompaniment. Mureka's separate instrumental/background-music and stem-separation APIs are not part of this flow.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
