# SongGift Supabase setup

## 1. Run the schema

Open the Supabase Dashboard for the project, go to **SQL Editor**, open
schema.sql, and run it once.

It creates:

- public.song_orders
- public.song_assets
- a private Storage bucket named songs

The bucket stays private. The Next.js server uses the Supabase service role
key to upload audio and creates a temporary signed URL for the result page.

## 2. Add local environment variables

Copy .env.example to .env.local and fill in:

~~~env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=songs
SUPABASE_SIGNED_URL_SECONDS=3600
~~~

SUPABASE_SERVICE_ROLE_KEY must stay server-side. Do not prefix it with
NEXT_PUBLIC_ and do not commit .env.local.

## 3. Restart the development server

~~~powershell
npm run dev
~~~

When Google Lyria returns audio, the app uploads it to:

~~~text
songs/{order_id}/{asset_id}.mp3
~~~

It then inserts the storage metadata into public.song_assets and returns a
signed URL to the result page.
