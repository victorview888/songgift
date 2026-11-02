# User accounts and My Songs

SongGift uses Supabase Auth for email sign-in. The interface supports a one-time
email code; a PKCE-protected email-link callback is also available for Supabase's
default templates. An account is created only after its email is verified.
Passwords and session tokens are not stored in browser JavaScript storage.

## Implemented

- /login: request and verify an email code, resend cooldown, existing-code entry.
- /my-songs: private account library, status filters, pagination, playback, download.
- /lyrics/:orderId: retrieve and save lyrics, resume checkout on another device.
- /song/:orderId: retrieve an order, resume generation polling, play and download.
- Ownership checks on every lyrics, music, status, payment, order and audio API.
- User-scoped RLS for song_orders and song_assets; server-only writes.
- Short-lived, private Storage links; the songs bucket remains private.
- Legacy guest orders are attached only to the account with their verified email.
  Orders without an email cannot be safely auto-assigned.
- A new order is created for each new song; repeat submissions of an active or
  completed music order do not request a new paid generation.

## Database and environment

Run supabase/migrations/20261102_user_song_library.sql once on the existing project.
The migration adds columns and indexes and keeps existing orders and audio files.
Fresh installations can run supabase/schema.sql, which includes this migration.

SUPABASE_PUBLISHABLE_KEY is a public project key used for user sessions. It is
separate from the existing server-only SUPABASE_SERVICE_ROLE_KEY. The latter is
never used as the identity of a signed-in customer. Cloudflare runtime configuration
contains the publishable key; model, payment and service-role secrets stay encrypted.

## Email delivery: required before public sign-in

Supabase's default email sender delivers only to project-team addresses and is
intended for development. Public sign-in requires custom SMTP. Do not disable email
verification: it protects account access and recovery of historical purchases.

Recommended setup: Resend, using a sending subdomain such as
auth.songforalways.com. This subdomain is for email only, not website hosting.

1. Create a Resend account and add auth.songforalways.com under Domains.
2. Copy the exact DNS records Resend provides into Cloudflare. Keep email records
   DNS-only where applicable. Do not change the website's @ or www records.
3. Wait until Resend marks the domain Verified, then create a sending API key.
4. In Supabase Authentication > Emails > SMTP Settings, enable custom SMTP:

| Setting | Value |
| --- | --- |
| Sender email | login@auth.songforalways.com |
| Sender name | SongGift |
| Host | smtp.resend.com |
| Port | 465 |
| Username | resend |
| Password | The Resend sending API key |

The SMTP password belongs in Supabase's SMTP settings. It is not a database
password and is not required in the website's browser environment. No extra Resend
API key is required in the Worker for Supabase-managed authentication email.

5. Under Emails > Templates, set both Confirm sign up and Magic link or OTP to
   include the one-time code. Template editing may remain unavailable until custom
   SMTP is enabled. Suggested subject: Your SongGift sign-in code. Suggested body:

    <h2>Your SongGift sign-in code</h2>
    <p>Enter this code on SongGift:</p>
    <p style="font-size:32px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
    <p>This code expires soon. If you did not request it, ignore this email.</p>

6. Authentication > URL Configuration:
   Site URL: https://www.songforalways.com
   Redirect URLs: https://www.songforalways.com/auth/callback,
   http://localhost:3000/auth/callback, http://127.0.0.1:8787/auth/callback.
7. Test receipt and sign-in with a real mailbox outside the Supabase team. Check
   spam folders. Sending limits are separate from Workers and Supabase Storage.

Official documentation:
https://supabase.com/docs/guides/auth/auth-email-passwordless
https://supabase.com/docs/guides/auth/auth-smtp
https://resend.com/docs/send-with-smtp

## Verification without consuming music credits

Use two isolated, disposable Supabase test identities and an explicitly labelled
short WAV test asset. Verify real email-token exchange, HttpOnly session cookies,
own-order listing, signed audio downloads, account isolation, RLS, logout, and
rejection of other users' payment/generation requests before any provider call.
Generate test login tokens using the Supabase Admin API without sending email.
This verifies authentication and data access, not actual SMTP delivery. Remove
the disposable fixtures afterwards. Never assign a real customer's order to a
test identity or invoke paid generation to test account management.

Run the explicit integration workflow with Node 24: `node --env-file=.env.local scripts/test-account-access.mjs init`, then `test`, then `cleanup`. Set `SONGGIFT_INTEGRATION_URL` to the intended local or deployed site before testing. The workflow uses only its recorded disposable fixture IDs. Its private fixture directory is ignored by Git.
