# Phase 1 security acceptance

Staff accounts are provisioned only through the API workspace command. It uses the server-side Supabase secret and writes the single authoritative role to `staff_members`; there is no public staff-registration endpoint.

## Provision one staff member

Read the password without echoing it or storing it in shell history:

```bash
read -s STAFF_PROVISIONING_PASSWORD
export STAFF_PROVISIONING_PASSWORD
pnpm --dir apps/api staff:provision -- --email=dispatcher@sokoni.example --role=dispatcher --display-name="Primary Dispatcher"
unset STAFF_PROVISIONING_PASSWORD
```

The operation is idempotent. Re-running it updates the staff role, status, and display name without resetting an existing password.

## Provision the five local acceptance identities

This command refuses to run when `NODE_ENV=production`:

```bash
read -s STAFF_PROVISIONING_PASSWORD
export STAFF_PROVISIONING_PASSWORD
STAFF_TEST_EMAIL_DOMAIN=sokoni.local pnpm --dir apps/api staff:provision:test
unset STAFF_PROVISIONING_PASSWORD
```

It creates `admin`, `agent`, `dispatcher`, `finance`, and `viewer` accounts at the chosen domain. Use a local/test-only password of at least 12 characters.

## Verification

Run the automated security checks:

```bash
pnpm --dir apps/api test
pnpm --dir apps/operations-web test
pnpm db:test
```

The suites verify the five-role navigation matrix, backend permission denial, disabled staff denial, and database role grants. Manually smoke-test session refresh and logout in a browser because those depend on browser storage and the running Supabase Auth service.
