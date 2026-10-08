# Dashboard business authentication and crop preferences

This backend slice adds farmer/SME onboarding. It does not connect the dashboard
frontends, implement orders, or manufacture analytics. Existing mobile auth
contracts are unchanged; do not use their placeholder `/v1/auth` routes for the
new dashboard registration flow.

## Deployment

1. Apply `20261002000100_business_accounts_crop_preferences.sql` and
   `20261002000200_canonical_crop_catalogue.sql` after existing
   migrations. The change is additive; do not reset a deployed database.
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and the
   existing server configuration. Never expose the secret key in the frontend.
3. Enable phone signups **and phone confirmations** in Supabase Auth. Keep the
   OTP length at six digits. Configure the signed Send SMS hook to
   `/v1/auth/hooks/send-sms`, `SUPABASE_AUTH_SEND_SMS_HOOK_SECRETS`, and
   `YOOLA_SMS_API_KEY`. Test SMS delivery with a controlled test account.
4. Provision active staff with `applications.read` / `applications.review` using
   the existing staff provisioning flow. Clients cannot create warehouse roles.
5. Business-auth limits are database-backed across API replicas: 60 requests/IP
   per minute, one registration/resend per phone per minute, ten login or verify
   attempts/phone per minute. Keys are HMAC hashes; rotating the server secret
   resets the effective counters. Configure Express trusted proxies only for
   known infrastructure; never trust arbitrary X-Forwarded-For values.
6. Verify the flow below in staging, including invalid/expired OTPs. This change
   does not deploy migrations or configure a live Supabase project automatically.

Registration, verification and login use fresh public-key Supabase clients per
request. Business data commands use server-only transactional RPCs and explicitly
check actor identity, owner membership or staff permissions. Direct authenticated
writes and direct command execution are revoked; RLS limits read access.

## Auth contracts

All routes use the existing `{ success, data, meta }` / `{ success, error }`
envelopes and return `Cache-Control: no-store`.

| POST endpoint                  | JSON input                   | Result                           |
| ------------------------------ | ---------------------------- | -------------------------------- |
| `/v1/business-auth/register`   | `phoneNumber`, `password`    | 202; phone verification required |
| `/v1/business-auth/resend-otp` | `phoneNumber`                | 202; verification required       |
| `/v1/business-auth/verify-otp` | `phoneNumber`, `otpCode`     | Session                          |
| `/v1/business-auth/login`      | `phoneNumber`, `password`    | Session                          |
| `/v1/business-auth/refresh`    | `refreshToken`               | Rotated session                  |
| `/v1/business-auth/logout`     | Bearer access token, no body | Current session signed out       |

A session contains `accessToken`, `refreshToken`, `expiresAt`, `userId` and
`phoneVerified`. Persist tokens securely on the client; replace refresh tokens
when rotated. Logout revokes the refresh session; already-issued access JWTs may
remain valid until expiry. Phone verification is not business approval.

Numbers accept Ugandan local or +256 form. Passwords require at least eight
characters with uppercase, lowercase and a digit. Never send a role, approval
status or owner ID during registration.

## Onboarding sequence

1. Register, then verify the received OTP. Existing users log in instead.
2. With the returned bearer token, create the business:

```http
POST /v1/me/businesses
Content-Type: application/json
Authorization: Bearer <access-token>

{
  "operationId": "<new-UUID>",
  "kind": "farmer",
  "name": "Example Farm",
  "location": "Entebbe"
}
```

`kind` is `farmer` or `sme`. One owner can have one business of each kind. Retrying
creation resumes the existing business without overwriting it. Warehouse
provisioning and employee invitation UI are not included in this slice.

3. Fetch `GET /v1/agriculture/categories` for categories, then
   `GET /v1/agriculture/products`, optionally with `?category=CASH` or
   `?category=FOOD`. Use the returned UUIDs, not names, in preferences:

```http
PUT /v1/me/businesses/<id>/preferences
Content-Type: application/json
Authorization: Bearer <access-token>

{
  "operationId": "<new-UUID>",
  "expectedVersion": 1,
  "categories": ["CASH", "FOOD"],
  "productIds": ["<maize-product-UUID>", "<coffee-product-UUID>"]
}
```

Both categories are stored separately. Maize has one product ID in both groups.
Product IDs must be active and belong to at least one selected category.
Preferences can be changed after approval; they do not restrict trading.

4. Submit with `POST /v1/me/businesses/<id>/submit`, passing a new `operationId`
   and the latest `expectedVersion`. At least one category and product are required.
5. Staff list `/v1/admin/business-applications`, inspect `/<id>`, then POST to
   `/<id>/review` with `operationId`, `expectedVersion`, `status` and `reason`.
   Submitted applications can become `approved`, `changes_requested` or `rejected`;
   approved businesses can become `suspended`. Members cannot review their own
   business, even if they also have staff permission. All decisions are audited.
6. Read `GET /v1/me/businesses/<id>/analytics-context` for default selected-product
   filters and `metricsAvailable: false`. No sales/AI metrics exist yet.

Other routes: `GET /v1/me/businesses`, `GET /v1/me/businesses/<id>` and
`PATCH /v1/me/businesses/<id>` (name/location plus operation/version fields).
Profile changes are allowed in draft or changes-requested state. List endpoints
accept `limit` (1–100, default 50) and `offset` (0–100000, default 0).

A retry uses the **same operation ID and identical body**. Changed input requires
a new operation ID. A stale expected version returns 409; reload before retrying.
The replay response is the original snapshot; fetch the business for current state.

All future trading endpoints must check current approved status and membership on
the server; `canTrade` is an informational UI field, not authorization proof.

## Verification

### Registration returns 503 while `/health` succeeds

`/health` is a process liveness check; it does not verify Supabase Auth or database
dependencies. Inspect the registration response's `error.message`:

- **Authentication rate limiter unavailable.** The database RPC
  `public.consume_business_auth_limit` is missing, inaccessible to the configured
  service role, or the database cannot be reached. It is created by
  `20261002000100_business_accounts_crop_preferences.sql`. Do not bypass throttling.
  Check that the linked project matches `SUPABASE_URL`, then inspect and apply
  pending migrations from the repository root:

  ```sh
  pnpm exec supabase migration list --linked
  pnpm exec supabase db push --linked --dry-run
  pnpm exec supabase db push --linked
  ```

  Review the dry run before applying it; `db push` applies all pending migrations.
  If the migration is already applied, verify the API's `SUPABASE_SECRET_KEY`
  belongs to this project and has service-role access. Check the PostgREST schema
  cache and database connectivity. Never reset the hosted database to fix this.

- **Authentication provider unavailable.** Check hosted Auth logs and the SMS hook
  delivery path. Hosted Supabase needs a publicly reachable HTTPS hook URL; it
  cannot call your laptop's `localhost:4000` or `host.docker.internal`.
- **Phone confirmations must be enabled for business registration.** Enable phone
  confirmations in the hosted project's Auth settings. Phone signups must also
  be enabled. The local `supabase/config.toml` does not update hosted settings.

See [Yoola SMS setup](yoola-supabase-auth-sms.md#hosted-supabase-setup) for the hosted
phone provider and hook configuration. Restart the API after changing its `.env`.

### `db push` stops with `type "listing_status" already exists`

The push has stopped at the older catalogue migration, before the business-auth
migration can create its rate limiter. Some existing database objects overlap
with pending migration SQL. This can happen when schema changes were made outside
the CLI migration history or when the hosted database uses an older baseline.
The existing enum alone does not prove that the whole migration was applied.

Inspect history and export the current schema before making a repair:

```sh
pnpm exec supabase migration list --linked
pnpm exec supabase db dump --linked --schema public,storage --file hosted-schema.sql
```

Compare the export against
`supabase/migrations/20260806000400_catalogue_listings_storage.sql`, including enum
values, tables and columns, constraints, functions, views, indexes, triggers,
permissions and RLS policies. If the entire migration's effects are already
present (accounting for later changes), repair that specific history entry as
applied, then review a new push dry run. If only some objects are present, prepare
a reconciliation for the missing or incompatible definitions instead of marking
the migration applied. Repeat the check for any subsequent conflict.

Do not bulk-mark pending migrations as applied: this would leave the missing
business-auth function absent while telling the CLI not to create it. Do not drop
the existing enum or reset the hosted database to get past the conflict.

- API tests: `pnpm --filter @sokoni-digital/api test`
- Type checks: `pnpm --filter @sokoni-digital/api typecheck`
- SQL assertions after migrations:
  `psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/business_accounts.sql`

The SQL test is transactional and rolls back fixtures. It exercises verified
identity, crop overlap, invalid selections, repeat-safe creation, version checks,
self-review prevention, approval, suspension, RLS and throttling. Use a dedicated
test database. Provider-adapter tests use test doubles; live SMS and hosted Auth
require the staging verification above.

The canonical catalogue seeds only coffee, maize and coconut. Categories are
`CASH` and `FOOD`; maize has both memberships under one product UUID. The earlier
extra seed products are removed only if unreferenced, otherwise archived while
preserving selections and historical operation snapshots. Product discovery
excludes archived products. See [Crop catalogue and preferences](crop-catalogue-preferences.md)
for the canonical tables and preference endpoints.
