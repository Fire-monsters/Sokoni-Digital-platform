# SME wholesale purchasing rollout

The SME purchase flow and Agro-Warehouse Buyer orders, Wholesale catalogue and
Finance views share the `wholesale_*` tables. This flow is separate from farmer
procurement `purchase_orders` and consumer marketplace orders. SME-to-warehouse
selling, dispatch and SME inventory receipt are outside this release.

## Current state (2026-10-03)

- The existing hosted project has the five focused migrations installed:
  staff identity, business accounts, canonical crops, agriculture procurement,
  and wholesale orders. The corresponding five versions are recorded in hosted
  migration history. The earlier repository migrations remain unreconciled;
  `supabase db push` is still unsafe. See
  [hosted-schema-reconciliation.md](hosted-schema-reconciliation.md).
- Before applying SQL, roles, schema (including `auth` and `storage` metadata),
  and data were exported to mode-600 files under `/private/tmp`:
  `sokoni-hosted-roles-20261003.sql`,
  `sokoni-hosted-pre-wholesale-20261003.sql`, and
  `sokoni-hosted-full-data-20261003.sql`. The restored copy retained the existing
  Auth user. Storage objects were empty at export. Database exports do not back
  up Storage file bytes or project settings.
- All five migrations and the rollback-only SQL test passed on the restored
  copy. The same SQL test passed on hosted after deployment; its fixture rows
  were rolled back. Hosted Auth user count remained one, the invoice bucket
  exists, and the canonical crop catalogue contains three active crops.
- A local API journey passed: approved SME submits, warehouse confirms, PDF
  downloads, finance records a partial external payment, and the SME sees the
  outstanding balance. No real provider transaction or dispatch was created.
- Localhost UI flags are enabled in ignored `.env.local` files. Production UI
  flags remain off. The hosted project has no approved SME, warehouse offer, or
  finance staff fixture, so a real hosted dashboard journey is still pending.

## Try it on localhost

1. Keep local Supabase running. Start the API with `pnpm --filter
@sokoni-digital/api dev`; `apps/api/.env` points it to local Supabase on port 4000. Start SME Dashboard and Agro-Warehouse with their existing dev scripts.
2. Restart the dashboard dev servers after changing `.env.local`, then refresh
   both browser tabs. The ignored SME and Agro-Warehouse env files set their API
   URL to `http://localhost:4000` and their wholesale flag to `true`.
3. Sign in using the local-only accounts in
   `/private/tmp/sokoni-local-wholesale-logins.txt`. The local fixture creates
   one approved SME, one approved warehouse, finance staff, and a published
   maize offer. The fixture script is `pnpm --filter @sokoni-digital/api
wholesale:seed:local`; it refuses non-local Supabase, reuses saved credentials, and resumes existing
   business setup. Repeated runs preserve the existing offer and its stock. The
   password file is private and must not be committed.

Local phone/password sign-in currently depends on the running local Auth
container having SMS sign-up enabled. A fresh local Supabase restart with the
checked-in config disables phone Auth until a local SMS provider is configured.

## Hosted sequence

1. For a real hosted journey, provision a verified warehouse owner and approve
   a genuine SME account. Grant a separate active finance staff account
   `wholesale.payments.verify`. Publish a real warehouse offer. Do not create a
   payment as a substitute for provider verification.
2. Deploy API and both dashboards with the flags off. Configure the SME API
   origin; configure Agro-Warehouse API origin, Supabase URL and publishable key.
   Provision a verified warehouse owner using `pnpm --filter @sokoni-digital/api
warehouse:provision -- --admin-user-id=<uuid> --owner-user-id=<uuid>
--name=<name> --location=<place>`. The owner signs in with a verified phone
   account. Finance staff sign in separately by email and need an active staff
   record with the dedicated permission.
3. Confirm an SME submission appears only in the intended warehouse. Verify
   frozen prices, quantity commitment, PDF, partial payment and balance. Test
   cross-business denial, concurrent confirmations and reference duplication.
   Then turn both production dashboard flags on.
4. Reconcile the remaining legacy migrations separately with explicit
   data-preserving repairs. Do not mark older migrations applied solely because
   some of their objects already exist, and do not run `supabase db push` until
   this work is complete.

The invoice PDF is generated on first authorized download from frozen invoice
rows. Its private object is retrieved through a 120-second signed URL. A failed
generation is marked retryable and does not create another invoice.
