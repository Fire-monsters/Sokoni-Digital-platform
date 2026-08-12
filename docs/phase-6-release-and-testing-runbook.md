# Phase 6 release and ecosystem testing runbook

This runbook covers the release configuration and verification required for the
Phase 6 delivery workflow: Google Maps, Supabase migrations and private proof
storage, native builds, push/SMS delivery, automated tests, and a complete
manual ecosystem test.

Run commands from the repository root unless a section says otherwise.

## 1. Current release-readiness notes

Four details must be resolved before a production release:

1. `apps/consumer-mobile/app.json` does not yet define an Android package name
   or iOS bundle identifier. Choose the permanent identifiers before creating
   Maps credentials or store builds.
2. The mobile projects do not yet contain `eas.json` files or EAS project IDs.
3. The consumer config currently reads one `GOOGLE_MAPS_API_KEY` for both
   Android and iOS. Google application restrictions are platform-specific, so
   a securely restricted production setup needs separate Android and iOS keys.
4. The API can deliver Expo pushes and register device tokens at
   `POST /v1/notifications/devices`, but the mobile apps do not yet install
   `expo-notifications` or register their Expo push tokens. Backend notification
   queue tests can run now; real device push delivery needs that client work.

There is also no checked-in browser/mobile end-to-end runner or reusable local
seed file. Current automated frontend tests cover policies and recovery rules,
not complete rendered user journeys.

## 2. Prerequisites

Install:

- Node.js 22 and Corepack;
- Docker Engine or Docker Desktop;
- Git;
- PostgreSQL client tools, including `psql`, for the concurrency tests;
- Android Studio for Android emulator/local Android builds;
- Xcode on macOS for iOS simulator/local iOS builds;
- an Expo account and EAS access;
- a Google Cloud project with billing enabled;
- separate staging and production Supabase projects;
- an Expo project and Twilio Messaging Service for production notifications.

Bootstrap the repository:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Never commit `.env`, Supabase secret/service-role keys, Twilio credentials,
database passwords, or Expo access tokens.

## 3. Credential boundaries

| Variable                               | Where it belongs                 | Can clients read it?                                           |
| -------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                  | Mobile build environment         | Yes                                                            |
| `EXPO_PUBLIC_SUPABASE_URL`             | Mobile build environment         | Yes                                                            |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Mobile build environment         | Yes                                                            |
| `VITE_API_URL`                         | Operations web build environment | Yes                                                            |
| `SUPABASE_SECRET_KEY`                  | API server only                  | No                                                             |
| `TWILIO_AUTH_TOKEN`                    | API server only                  | No                                                             |
| `EXPO_ACCESS_TOKEN`                    | API server only                  | No                                                             |
| Google native Maps keys                | Native build configuration       | Embedded in app; protect with application and API restrictions |

Supabase's secret/service-role key bypasses Row Level Security. It must never be
placed in an `EXPO_PUBLIC_*` or `VITE_*` variable.

## 4. Configure Google Maps securely

### 4.1 Choose permanent application identifiers

Add identifiers owned by your organization to the consumer app configuration:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourcompany.ekatale.consumer"
    },
    "android": {
      "package": "com.yourcompany.ekatale.consumer"
    }
  }
}
```

Do not copy the example identifiers unchanged. Changing either identifier later
creates a different application as far as the stores and Maps restrictions are
concerned.

### 4.2 Enable the native Maps SDKs

In Google Cloud Console:

1. Select or create the production project.
2. Attach a billing account.
3. Open **APIs & Services > Library**.
4. Enable **Maps SDK for Android**.
5. Enable **Maps SDK for iOS**.
6. Configure budget alerts and Maps quotas.

The current map uses the native SDK. Places API, Directions API, and continuous
background location are not required by Phase 6.

### 4.3 Create two restricted keys

Create `GOOGLE_MAPS_ANDROID_API_KEY`:

1. Set the application restriction to **Android apps**.
2. Add the consumer Android package name.
3. Add every authorized signing SHA-1:
   - the EAS/internal-build certificate for direct preview builds;
   - the Google Play App Signing certificate for Play-distributed builds.
4. Set API restrictions to **Maps SDK for Android** only.

Create `GOOGLE_MAPS_IOS_API_KEY`:

1. Set the application restriction to **iOS apps**.
2. Add the consumer bundle identifier.
3. Set API restrictions to **Maps SDK for iOS** only.

Google does not allow one API key to have both Android and iOS application
restriction types. Before production, update `app.config.js` to pass the two
variables independently:

```js
const androidMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
const iosMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;

// ios.config.googleMapsApiKey = iosMapsApiKey
// android.config.googleMaps.apiKey = androidMapsApiKey
```

The existing single `GOOGLE_MAPS_API_KEY` is acceptable only for a temporary
one-platform test key. Do not ship an unrestricted shared key.

Reference: [Google Maps Platform API security](https://developers.google.com/maps/api-security-best-practices).

## 5. Configure EAS and produce native builds

Each Expo app is its own EAS project. Start with the consumer app because it
contains the map:

```bash
cd apps/consumer-mobile
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest whoami
pnpm dlx eas-cli@latest build:configure
```

Accept configuration for Android and iOS. EAS will create/link the project and
add its project ID. Review every generated change before committing it.

For an interactive development client, install the development-build package:

```bash
pnpm exec expo install expo-dev-client
```

A useful `apps/consumer-mobile/eas.json` profile structure is:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "simulator": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "environment": "production",
      "autoIncrement": true
    }
  }
}
```

Create the EAS build variables for `preview` and `production`. Client-side
values are embedded in the application and are not secrets:

```bash
pnpm dlx eas-cli@latest env:create --name EXPO_PUBLIC_API_URL --value https://api.example.com --environment preview --visibility plaintext
pnpm dlx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://PROJECT.supabase.co --environment preview --visibility plaintext
pnpm dlx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value YOUR_PUBLISHABLE_KEY --environment preview --visibility plaintext
pnpm dlx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value YOUR_ANDROID_KEY --environment preview --visibility sensitive
pnpm dlx eas-cli@latest env:create --name GOOGLE_MAPS_IOS_API_KEY --value YOUR_IOS_KEY --environment preview --visibility sensitive
```

Repeat for `production` with production URLs and credentials. Verify names,
without printing secret values into logs:

```bash
pnpm dlx eas-cli@latest env:list --environment preview
pnpm dlx eas-cli@latest env:list --environment production
```

Build installable test binaries:

```bash
pnpm dlx eas-cli@latest build --platform android --profile preview
pnpm dlx eas-cli@latest build --platform ios --profile development
```

Build store artifacts only after preview testing passes:

```bash
pnpm dlx eas-cli@latest build --platform all --profile production
```

Repeat EAS project setup separately in `apps/rider-mobile` and
`apps/vendor-mobile` when producing their native release binaries. Use unique
Android/iOS identifiers for every app.

References: [EAS Build setup](https://docs.expo.dev/build/setup/),
[EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

## 6. Validate and deploy Supabase migrations

### 6.1 Recreate and test locally

`db:reset` destroys the local database and recreates it from migrations. Never
point this command at staging or production.

```bash
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:types
git diff --exit-code packages/database-types/src/database.types.ts
```

Run database race tests while local Supabase is running:

```bash
bash supabase/tests/concurrent_checkout.sh
bash supabase/tests/concurrent_payment_finalization.sh
bash supabase/tests/concurrent_delivery_offer_acceptance.sh
```

The delivery race test must report one winner, one withdrawal, and one
assignment.

### 6.2 Deploy to staging

Take a staging backup or confirm Point-in-Time Recovery before schema changes.
Then authenticate and link the CLI:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref STAGING_PROJECT_REF
pnpm exec supabase migration list --linked
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase migration list --linked
```

The migration list should show `20260811001400` through `20260811001700` on both
the local and remote sides. Confirm in Supabase Dashboard that these private
buckets exist:

- `quality-check-images`;
- `delivery-proof-images`.

`delivery-proof-images` must remain private, JPEG-only, and limited to 500 KB.
There should be no public URL or broad client `storage.objects` policy for proof
evidence. The API issues short-lived signed upload/read URLs using its server
credential.

After staging smoke tests pass, repeat the link, dry-run, backup check, and push
against the production project. Deploy database migrations before deploying an
API version that depends on them. If rollback is needed after a migration has
been applied, create a forward corrective migration instead of editing or
deleting migration history.

Reference: [Supabase environment and migration management](https://supabase.com/docs/guides/deployment/managing-environments).

## 7. Configure API, signed Storage, push, and SMS

Set these in the production API hosting platform, not in a mobile or Vite build:

```dotenv
NODE_ENV=production
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
SUPABASE_JWKS_URL=https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json

CORS_ORIGINS=https://operations.example.com

NOTIFICATION_DELIVERY_BATCH_SIZE=50
NOTIFICATION_MAX_ATTEMPTS=5
NOTIFICATION_RETRY_BASE_SECONDS=30
NOTIFICATION_POLL_INTERVAL_MS=15000
EXPO_ACCESS_TOKEN=YOUR_EXPO_ACCESS_TOKEN

TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=MG...
```

Important behavior in this repository:

- the notification scheduler starts inside the API process;
- it polls the transactional notification outbox every configured interval;
- push destinations come from `notification_devices`;
- SMS destinations come from the user's Supabase Auth phone number;
- phone numbers must be valid E.164 numbers, such as `+256...`;
- `EXPO_ACCESS_TOKEN` is required only when enhanced Expo push security is
  enabled, but enabling it is recommended for production;
- the `SUPABASE_AUTH_SMS_TWILIO_*` variables are for Supabase Auth OTP and are
  separate from the API notification worker's `TWILIO_*` variables.

The API's `SUPABASE_SECRET_KEY` is also the credential used to create signed
Storage upload and evidence URLs. No additional Storage secret is required.

### Native push prerequisite

Before testing real push delivery, each receiving mobile app must:

1. install `expo-notifications`;
2. add the `expo-notifications` config plugin;
3. request notification permission;
4. obtain an Expo push token using its EAS project ID;
5. send the token to authenticated `POST /v1/notifications/devices`;
6. handle notification receipt and notification taps;
7. configure FCM v1 for Android and APNs credentials for iOS.

Push notifications require a native development/production build; do not use
Expo Go for this verification.

References: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/),
[Expo push security](https://docs.expo.dev/push-notifications/sending-notifications/),
[Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## 8. Run the automated repository test suite

### 8.1 Exact CI-equivalent gates

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:ci
pnpm build
```

Then run the database suite from section 6.1. The GitHub workflows split these
into normal CI and database jobs, so both sets are required before release.

The convenience command below is useful locally, but it uses `pnpm test` rather
than the coverage-oriented `pnpm test:ci` command used by CI:

```bash
pnpm validate
```

### 8.2 Frontend and recovery tests only

```bash
pnpm --dir apps/consumer-mobile test
pnpm --dir apps/operations-web test
pnpm --filter @sokoni-digital/domain test
pnpm --filter @sokoni-digital/offline-sync test
```

These cover consumer PIN/evidence visibility, dispatcher board classification,
assignment-cache freshness, location-unavailable behavior, critical offline
blocking, slow proof recovery policy, queue persistence, and duplicate replay.

They are policy/unit tests. They do not launch a phone, press UI controls, or
run a real browser journey. The rider and vendor apps currently have no `test`
script. For repeatable rendered end-to-end coverage, add a mobile runner such
as Maestro and browser coverage with Playwright as a separate testing slice.

### 8.3 API delivery and dispatcher tests only

```bash
pnpm --dir apps/api exec vitest run \
  src/modules/delivery/delivery-proof.service.test.ts \
  src/modules/delivery/delivery.routes.test.ts \
  src/modules/delivery/dispatcher.service.test.ts \
  src/modules/delivery/dispatcher.routes.test.ts
```

## 9. Run the ecosystem locally

Start local Supabase and obtain its publishable/anonymous and secret/service
keys:

```bash
pnpm db:start
pnpm db:status
```

Put the local values in `.env`, then start each surface in a separate terminal:

```bash
pnpm --dir apps/api dev
```

```bash
pnpm --dir apps/operations-web dev
```

```bash
pnpm --dir apps/consumer-mobile exec expo start --clear --port 8081
```

```bash
pnpm --dir apps/rider-mobile exec expo start --clear --port 8082
```

```bash
pnpm --dir apps/vendor-mobile exec expo start --clear --port 8083
```

Host addressing matters:

- web and iOS Simulator can generally use `127.0.0.1`;
- Android Emulator reaches the host as `10.0.2.2`, so use
  `http://10.0.2.2:4000` and `http://10.0.2.2:54321`;
- a physical phone cannot use the computer's `localhost`; use a reachable LAN
  address and firewall rules, or point all apps to hosted staging.

The operations web app does not have a login screen. It expects an admin/agent
Supabase access token to be pasted into the token field. For local testing only,
create an email/password test user in Supabase Studio. In Studio's SQL editor,
give only that local user the operations role:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"roles":["admin"]}'::jsonb
where email = 'operations-local@example.test';
```

Sign the user in against local Supabase and extract its ordinary access token.
Replace the placeholders with the local anonymous/publishable key printed by
`pnpm db:status` and the password chosen in Studio:

```bash
curl --fail-with-body --silent \
  'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H 'apikey: LOCAL_ANON_KEY' \
  -H 'Content-Type: application/json' \
  --data '{"email":"operations-local@example.test","password":"LOCAL_TEST_PASSWORD"}' \
  | jq -r '.access_token'
```

Paste that access token into operations web. Never paste a Supabase
secret/service-role key into this field. For staging, create a dedicated
least-privilege `agent` test account through an audited administrative process;
do not manipulate production Auth records from an ad-hoc SQL session.

There is no `supabase/seed.sql`, so a clean reset has schema but no reusable
end-to-end marketplace fixture. Create test accounts/data through the apps and
operations workflow, or add a deterministic development-only seed before
expecting one-command manual smoke tests.

## 10. Complete manual Phase 6 journey

Use staging or a local database containing a market, delivery zone, approved
vendor/listing, consumer, approved rider, and admin/agent.

1. Consumer creates a delivery checkout and completes the configured payment
   path.
2. Vendor accepts the seller order, prepares it, uploads packing evidence,
   completes the checklist, and marks it ready for pickup.
3. Rider enables availability and grants foreground location permission.
4. Trigger nearby offers or manually assign the rider from operations.
5. If testing offers, send the same delivery to two riders and verify only one
   can accept it.
6. Restart the winning rider app and verify the cached current assignment is
   restored.
7. Rider arrives at the market; vendor and rider complete each pickup handover.
8. Verify multi-seller pickup cannot be marked complete until every required
   seller handover is confirmed.
9. Rider marks the delivery in transit. Verify the consumer sees status-based
   progress and the most recent location snapshot on Google Maps.
10. Deny or disable location and repeat a permitted status update. Delivery
    progress must continue without a map snapshot.
11. Rider arrives at the customer. Consumer generates the secure PIN.
12. Rider enters the PIN, captures proof, and uploads it.
13. Throttle or disconnect the network during upload. Restart the app, restore
    connectivity, and verify the persistent upload resumes.
14. While offline, verify pickup confirmation, customer arrival, PIN
    confirmation, and completion are blocked rather than falsely acknowledged.
15. Complete the delivery. Verify it succeeds only with a confirmed consumer PIN
    and ready evidence.
16. Consumer opens the completed order and views signed evidence. Verify an
    unrelated consumer cannot fetch it.
17. Admin opens the same evidence in operations and verifies short-lived signed
    URLs are returned instead of Storage paths.
18. Report a delivery issue and verify the exception queue, issue resolution,
    notification outbox, audit history, and dispatcher controls.
19. Test cancellation before custody transfer, reassignment, customer
    unavailable, return-to-market, and customer/rider contact actions.
20. Confirm that completed/terminal deliveries stop exposing rider location.

## 11. Release acceptance checklist

- [ ] Permanent package and bundle identifiers are committed.
- [ ] Separate restricted Android/iOS Maps keys work in signed builds.
- [ ] Staging migrations and database tests pass.
- [ ] Private proof buckets and size/MIME restrictions are verified.
- [ ] API server-only credentials are stored in the hosting secret manager.
- [ ] Native push registration is implemented and a real device receives a push.
- [ ] Twilio sends to a verified production test number.
- [ ] Signed proof upload and consumer/admin evidence reads work in staging.
- [ ] Complete CI, database, and race suites pass from a clean checkout.
- [ ] Android and iOS preview builds complete the manual Phase 6 journey.
- [ ] Operations actions and audit records are verified.
- [ ] Monitoring covers API errors, notification failures, proof upload failures,
      stale rider locations, and open delivery exceptions.
