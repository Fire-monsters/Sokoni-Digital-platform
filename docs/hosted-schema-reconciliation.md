# Hosted schema mismatch blocking SME authentication

Read-only inspection on 2026-10-02 of the linked project matching the API's
configured Supabase project. No hosted schema or migration-history repairs were
applied during this inspection.

After the decision to preserve the project, the targeted auth repair below was
applied on 2026-10-02. The hosted SQL assertions passed with fixtures rolled back,
and the running API got past the limiter to return `401 UNAUTHENTICATED` for an
intentionally invalid refresh token. No migration-history entries were changed.
Full business onboarding, legacy schema reconciliation and live SMS delivery
remain separate work.

## Why registration fails

The registration endpoint invokes `consume_business_auth_limit` before contacting
Supabase Auth. The function and `business_auth_limits` table are absent. Their
creation migration is pending, but `db push` stops earlier at
`20260806000400_catalogue_listings_storage.sql` because `listing_status` exists.

The CLI reports all 38 repository migration versions as absent from remote
history. That does not mean the hosted database is empty: it already contains
overlapping objects with incompatible definitions.

## Confirmed schema differences

| Object                                              | Hosted definition                                                                        | Repository expectation                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `listing_status` enum                               | `draft`, `active`, `out_of_stock`, `archived`                                            | `draft`, `pending_approval`, `changes_requested`, `active`, `paused`, `archived` |
| `seller_accounts`                                   | Absent                                                                                   | Owner identities isolated from public seller display data                        |
| `sellers.verification_status`                       | Uses `verification_status` enum                                                          | Uses `seller_verification_status` enum                                           |
| `listings`                                          | Includes `unit_size`, `price`, `package_weight`, `approved_price`; `version` is `bigint` | Includes `package_quantity`, `approved_price_ugx`; `version` is `integer`        |
| `markets.slug`                                      | Absent                                                                                   | Required unique slug                                                             |
| `categories.updated_at`                             | Absent                                                                                   | Timestamp used by the catalogue migration's update trigger                       |
| `consume_business_auth_limit(text,integer,integer)` | Absent                                                                                   | Service-role-only database throttle                                              |
| `businesses`, `business_auth_limits`                | Absent                                                                                   | Created by the first business-auth migration                                     |

This is a targeted comparison, not a full audit of every migration, constraint,
function, policy or grant. A schema-only export was obtained for further review;
it contains no table rows. The export is a diagnostic snapshot, not a data backup.

## Recovery choices

### Unblock account authentication on the existing project

The standalone repair
[`20261002_business_auth_rate_limiter.sql`](../supabase/repairs/20261002_business_auth_rate_limiter.sql)
adds the missing rate-limit table and function required by registration, login,
OTP verification, resending, refresh and logout. It enables RLS, restricts function
execution to `service_role`, rejects incompatible existing table definitions and
reloads the PostgREST schema cache. The script is transactional and can be rerun
without resetting existing counters. Run it as the database owner in the hosted
SQL Editor, or with the current CLI:

```sh
pnpm exec supabase db query --linked --file supabase/repairs/20261002_business_auth_rate_limiter.sql
```

Verify the function afterwards:

```sql
select to_regprocedure('public.consume_business_auth_limit(text,integer,integer)');
```

This is an immediate auth repair, not a reconciliation of all application schemas.
It does not add business onboarding or change migration-history entries. In the
eventual reconciled baseline, account for these installed objects instead of
blindly rerunning the first business-auth migration's `CREATE` statements.
Phone provider and SMS-hook settings must still be configured for OTP delivery.
Keep the configured Supabase URL and both keys from the same project. The current
`.env` keys were rejected as invalid during a direct SDK check, even though the
already-running API got past the repaired limiter. Correct the saved configuration
before restarting; the running process may be using different environment values.

### Preserve the existing project

First capture a restorable backup and compare the full hosted schema against the
repository. Identify which definitions and data mappings must be retained. Build
and validate a reconciliation on an isolated copy, including dependent functions,
views, constraints, triggers and RLS. Establish a reproducible migration baseline
and accurate history only once the corresponding schema changes are verified.
Then apply the remaining business-auth migrations and test the rate limiter and
registration. This route is required when existing data and users must remain in
this project.

Do not mark `20260806000400` as applied based on the existing enum: the hosted
database is missing other effects of that migration and uses different field
definitions. Do not bulk-mark the 38 pending migrations, reset the hosted database,
or drop the enum with cascading dependencies.

### Use a clean development project

Create a separate Supabase project while retaining the existing project. Link the
repository to the new project, review a push dry run and apply the repository's
migrations. Update the API's Supabase URL, publishable and secret keys together;
update any frontend or mobile apps that connect directly to Supabase. Configure
phone signups, phone confirmations, six-digit OTPs and the signed Yoola SMS hook
for the new project. Verify registration, OTP verification and login with a
controlled account. Existing users and data remain in the old project; moving
them is a separate task.

Changing the link alone does not change the API's `.env`. Restart the API after
updating its configuration. Local migrations must still be validated on the clean
project; this inspection does not establish that a full deployment has succeeded.

See [Supabase migration tracking and repair](https://supabase.com/docs/guides/deployment/database-migrations#diagnosing-and-fixing-sync-errors)
and [dashboard auth deployment](dashboard-business-auth.md).
