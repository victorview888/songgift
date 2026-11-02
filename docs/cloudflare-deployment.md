# Cloudflare Workers Free deployment

Workers replaces the website and API hosting previously supplied by Vercel.
The existing Supabase project, Postgres tables, private songs bucket, and saved
audio files are reused. No R2 bucket or replacement database is required.

## Build and preview

Use Node.js 22.12 or later; this setup was verified with Node.js 24.

    npm ci
    npm run build:vinext
    npm run start:vinext

The preview uses Wrangler's actual Workers runtime at localhost:8787.
The original npm run dev and npm run build commands remain available.
The vinext adapter uses static prerendering for eligible routes; API routes stay
dynamic. Both runtimes must be checked before promoting a deployment.

## Existing services

The public configuration in wrangler.jsonc selects DeepSeek lyrics, fal Lyria
music, and the existing Supabase project ngggfgfpaxzwjphkwmpy. Keep the same
SUPABASE_SERVICE_ROLE_KEY to access its song_orders, song_assets, and private
songs bucket. Do not create a new Supabase project or expose this key through
NEXT_PUBLIC_ variables.

Add these existing credentials as encrypted runtime secrets on the songgift
Worker, not as public vars or browser-side VITE_ variables:

- DEEPSEEK_API_KEY
- FAL_KEY
- SUPABASE_SERVICE_ROLE_KEY
- PAYPAL_CLIENT_ID
- PAYPAL_CLIENT_SECRET

Optional email delivery uses RESEND_API_KEY and SONGGIFT_FROM_EMAIL.
For local Workers testing, copy .dev.vars.example to .dev.vars and fill only
the required secrets. Both .dev.vars and generated output are ignored by Git.
Never upload .env.local or .dev.vars as static assets.

## Git deployment

Create a Worker connected to victorview888/songgift using these settings:

- Build command: npm run build:vinext
- Deploy command: npm run deploy:vinext
- Preview command: npx wrangler versions upload --config dist/server/wrangler.json
- Build environment: NODE_VERSION=24

Use a deployment token dedicated to SongGift rather than broadening an unrelated
project's token. Runtime API secrets do not need to be available during the build.
Workers Free must remain selected; no paid cache or storage resources are part
of this configuration. Free requests and CPU limits still apply independently
of a successful local build.

## Payment URLs and validation

PayPal remains in sandbox mode. The API derives its return and cancel origins
from the current request when PAYPAL_RETURN_URL and PAYPAL_CANCEL_URL are unset,
so preview testing stays on its own origin. Do not copy localhost callback
overrides to the cloud. Add Live credentials separately before real checkout.

Check the homepage, /create, /lyrics/demo, /song/demo, and /api/health on the
workers.dev preview. Health must report database=connected, storage=connected,
lyricsProvider=deepseek, and musicProvider=fal. Check a previously saved song's
signed playback URL to verify the original audio is still accessible. Do not
submit extra paid model requests just to check hosting.

Only connect songforalways.com and www.songforalways.com after preview validation.
Preserve the canonical redirect from the apex domain to www. Keep the old Vercel
deployment available until the custom domain has been verified on Workers.

## Connected deployment

The Cloudflare Worker is named songgift. Its preview URL is
https://songgift.victorview888.workers.dev and its Git source is the master branch
of victorview888/songgift. Build with npm run build:vinext and upload the generated
Worker with npm run deploy:vinext; the deploy command does not rebuild it.
NODE_VERSION=24 is configured in Workers Builds. Runtime secrets are encrypted on
the Worker and are not supplied to the build or committed to this repository.

Verified on 2026-11-02: homepage, create, lyrics/demo, song/demo, health API, and
range playback of a previously persisted real audio file. The preview reported
Supabase database and Storage connected with DeepSeek and fal selected. No new
paid generation or real payment was submitted during hosting verification.
