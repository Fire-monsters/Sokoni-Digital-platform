# Yoola SMS for Supabase phone authentication

Supabase Auth calls `POST /v1/auth/hooks/send-sms`. The API verifies the Standard Webhooks
signature and sends the OTP through Yoola. The same hook secret must be configured in Supabase
and in the API environment.

## Local setup

1. Generate a 32-byte Standard Webhooks secret:

   ```sh
   printf 'v1,whsec_'
   openssl rand -base64 32 | tr -d '\n'
   printf '\n'
   ```

2. Add the complete output and the Yoola key to the repository root `.env`:

   ```dotenv
   YOOLA_SMS_API_KEY=your-yoola-api-key
   SUPABASE_AUTH_SEND_SMS_HOOK_SECRETS=v1,whsec_your-base64-secret
   ```

3. Start the API. It must be listening on host port `4000` when an OTP is requested:

   ```sh
   pnpm --filter @sokoni-digital/api dev
   ```

4. Restart the local Supabase stack so it reloads `supabase/config.toml` and `.env`:

   ```sh
   pnpm db:stop
   pnpm db:start
   ```

5. Request an OTP with the local publishable/anon key reported by `pnpm db:status`:

   ```sh
   curl http://127.0.0.1:54321/auth/v1/otp \
     -H 'Content-Type: application/json' \
     -H 'apikey: YOUR_LOCAL_PUBLISHABLE_OR_ANON_KEY' \
     -d '{"phone":"+256704487563","create_user":true}'
   ```

   Replace the phone number with a Yoola-supported number you control. A successful request
   returns an empty JSON object and the phone receives the OTP.

6. Verify the OTP through the Supabase client or REST API:

   ```sh
   curl 'http://127.0.0.1:54321/auth/v1/verify' \
     -H 'Content-Type: application/json' \
     -H 'apikey: YOUR_LOCAL_PUBLISHABLE_OR_ANON_KEY' \
     -d '{"phone":"+256704487563","token":"THE_RECEIVED_CODE","type":"sms"}'
   ```

## Hosted Supabase setup

The local `config.toml` does not configure a hosted project automatically.

1. Deploy the API at a public HTTPS address.
2. Set `YOOLA_SMS_API_KEY` and `SUPABASE_AUTH_SEND_SMS_HOOK_SECRETS` in the API host's secret
   manager. Never expose either value to a browser or mobile build.
3. In the Supabase dashboard, open **Authentication > Hooks**, enable **Send SMS**, select an
   HTTP hook, and enter `https://YOUR_API_HOST/v1/auth/hooks/send-sms`.
4. Configure the dashboard hook with the exact same `v1,whsec_...` secret used by the API.
5. Enable phone sign-ups under **Authentication > Sign In / Providers > Phone**.
6. Send an OTP to a test number and inspect API logs and the Yoola delivery dashboard.

HTTP hooks have a five-second total execution budget. The endpoint therefore sends through
Yoola synchronously and returns `503` with `Retry-After` when Yoola is temporarily unavailable.
