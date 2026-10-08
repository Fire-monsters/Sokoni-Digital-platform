# Sokoni wholesale release

This release runs the API, SME dashboard, Agro-Warehouse and Caddy on one Arm64
EC2 host. PostgreSQL, Auth and Storage remain in the existing hosted Supabase
project. Never run `supabase db push`, seed accounts, or database reset as part of
these deployment steps. Earlier hosted migrations remain unreconciled.

## What changes at runtime

Compose forces `NODE_ENV=production`, `APP_MODE=wholesale` and
`PAYMENTS_ENV=disabled`. Business auth, the SMS hook, business review, crops and
wholesale remain available. Consumer routes and their payment, notification and
delivery schedulers are excluded. Manual wholesale payment verification is
independent of Pesapal. Normal local development still defaults to full mode.

`/health` checks the process. `/readyz` checks the canonical category RPC with a
five-second timeout; it does not prove SMS delivery, every grant, or a whole order
journey. API errors do not disclose provider readiness details.

Only Caddy publishes ports. `TRUST_PROXY_HOPS=1` is safe here because the API has no
host port and Caddy replaces client-supplied X-Forwarded-For. Do not publish API
port 4000 with that setting. CORS permits the two configured dashboard origins.

## 1. Build and test on your Mac

Run from the repository root. Docker must be running; these commands need Arm64
emulation on an Intel Mac. The build context excludes local secrets. The API
runtime contains compiled JS and production dependencies. SME uses Nitro's
Node-server preset, retaining the normal Lovable build configuration. Warehouse
uses Next standalone output and webpack, with TypeScript checking enabled.

```sh
pnpm install --frozen-lockfile
pnpm --filter @sokoni-digital/config test
pnpm --filter @sokoni-digital/api typecheck
pnpm --filter @sokoni-digital/api lint
pnpm --filter @sokoni-digital/api test
pnpm --filter sme-dashboard typecheck
pnpm --filter sme-dashboard test

docker buildx build --platform linux/arm64 --load \
  -f deploy/Dockerfile.api -t sokoni-api:check .
docker buildx build --platform linux/arm64 --load \
  -f deploy/Dockerfile.sme -t sokoni-sme:check .
```

Warehouse's Supabase URL and **publishable** key are public build arguments. Never
pass the secret/service-role key as a build argument. Set these two shell
variables to the hosted project's public settings, then build:

```sh
docker buildx build --platform linux/arm64 --load \
  -f deploy/Dockerfile.warehouse -t sokoni-warehouse:check \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$WHOLESALE_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$WHOLESALE_SUPABASE_PUBLISHABLE_KEY" .

bash deploy/smoke-image.sh api sokoni-api:check
bash deploy/smoke-image.sh sme sokoni-sme:check
bash deploy/smoke-image.sh warehouse sokoni-warehouse:check
```

The smoke script uses dummy credentials and checks startup/HTTP routing, not real
Supabase access. Validate the authenticated journey separately before inviting
users. No test user or payment is created by these builds.

## 2. Publish through GitHub

Commit the reviewed changes and push through your normal branch/PR workflow.
In repository Settings → Secrets and variables → Actions → Variables, add:

- `WHOLESALE_SUPABASE_URL`: the existing hosted Supabase URL.
- `WHOLESALE_SUPABASE_PUBLISHABLE_KEY`: its public publishable key.

No Supabase secret or Yoola credential belongs in GitHub build settings. Enable
Actions/package publishing for the repository if organization policy requires it.
PRs test and build without publishing. After merging, open Actions → Wholesale
release → Run workflow on the default branch. The workflow runs regression checks,
builds Arm64 images, starts each image, and publishes to GHCR using GITHUB_TOKEN.
It does not connect to EC2 or change Supabase.

Download the `wholesale-release-<commit>` artifact after every job succeeds. It
contains Compose, Caddy configuration, the environment template and `release.env`
with exact image digests. Keep the GHCR packages private and grant your EC2 pull
account access. Use a GitHub personal access token with `read:packages` and any
required organization SSO authorization for registry login.

## 3. Configure EC2 and DNS

Use your Elastic IP for these Namecheap A records: `api`, `sme`, `warehouse`.
Allow inbound TCP 80/443 from the internet and TCP 22 from your own public IP/32.
Do not open 3000, 4000 or database ports. Install Docker/Compose using the earlier
server setup guide. No local Supabase is installed on EC2.

Upload the extracted artifact from your Mac (replace the key, IP and release ID):

```sh
ssh -i ~/Downloads/sokoni-production.pem ubuntu@YOUR_ELASTIC_IP \
  'mkdir -p /opt/sokoni/releases/RELEASE_ID'
scp -i ~/Downloads/sokoni-production.pem /path/to/extracted-release/* \
  ubuntu@YOUR_ELASTIC_IP:/opt/sokoni/releases/RELEASE_ID/
```

Inside SSH, create the API environment file once, then edit its placeholders:

```sh
cd /opt/sokoni/releases/RELEASE_ID
install -d -m 0700 /opt/sokoni/secrets
if [ ! -f /opt/sokoni/secrets/api.env ]; then
  install -m 0600 api.env.example /opt/sokoni/secrets/api.env
fi
nano /opt/sokoni/secrets/api.env
```

Both Supabase keys must match the hosted project. Configure the existing Yoola
key and the exact signed SMS hook secret. Use the template CORS domains. Keep
this file on the server, never in Git. Compose supplies deployment mode and port.

Log in to GHCR without putting the token into shell history:

```sh
read -r -p 'GitHub username: ' GHCR_USER
read -r -s -p 'GitHub read:packages token: ' GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | sudo docker login ghcr.io -u "$GHCR_USER" --password-stdin
unset GHCR_TOKEN
```

## 4. Start the selected release

```sh
sudo docker compose --env-file release.env -f compose.yaml config --quiet
sudo docker compose --env-file release.env -f compose.yaml pull
sudo docker compose --env-file release.env -f compose.yaml up -d --wait
sudo docker compose --env-file release.env -f compose.yaml ps
```

The fixed Compose project name `sokoni` preserves Caddy certificate volumes across
release directories. Caddy starts after application health checks succeed and
obtains HTTPS certificates once DNS resolves and ports 80/443 are reachable.

```sh
curl -f https://api.solgemtradecomp.online/health
curl -f https://api.solgemtradecomp.online/readyz
curl -I https://sme.solgemtradecomp.online
curl -I https://warehouse.solgemtradecomp.online
sudo docker compose --env-file release.env -f compose.yaml logs --tail=100 api caddy
```

`up --wait` verifies container checks; it does not guarantee certificate issuance.
Verify the public HTTPS URLs separately. Logs are bounded to 3 × 10 MB per
service. Restart policies recover crashed processes, but an unhealthy running
process is not automatically restarted by Docker health checks.

## 5. Enable real registration and trading

In hosted Supabase, enable phone signups/confirmations and configure the signed
Send SMS HTTP hook:

`https://api.solgemtradecomp.online/v1/auth/hooks/send-sms`

The hook secret must match the server file. Set Auth site/redirect URLs to the
actual HTTPS dashboard domains. The local Supabase config does not update hosted
Auth settings. Check real SMS delivery to a number you control.

The image includes these provisioning entrypoints:

```sh
read -r -s -p 'Initial staff password: ' STAFF_PROVISIONING_PASSWORD
printf '\n'
export STAFF_PROVISIONING_PASSWORD
sudo --preserve-env=STAFF_PROVISIONING_PASSWORD docker compose \
  --env-file release.env -f compose.yaml run --rm --no-deps \
  -e STAFF_PROVISIONING_PASSWORD api node dist/scripts/provision-staff.mjs \
  --email=ADMIN_EMAIL --role=admin --display-name='Sokoni administrator'
unset STAFF_PROVISIONING_PASSWORD

sudo docker compose --env-file release.env -f compose.yaml run --rm --no-deps \
  api node dist/scripts/provision-warehouse.mjs \
  --admin-user-id=ADMIN_UUID --owner-user-id=VERIFIED_OWNER_UUID \
  --name='WAREHOUSE_NAME' --location='WAREHOUSE_LOCATION'
```

Finance uses the same staff command with `--role=finance`. Read the password
privately and unset it afterwards; never put it in command arguments.
Warehouse provisioning requires an
already phone-verified owner and a separate active admin.

Business application review uses the existing authenticated
`/v1/admin/business-applications` API. See `docs/dashboard-business-auth.md` in the
repository for the contracts; no separate staff approval website is deployed.

Verify registration → SMS → SME submission → separate staff approval → published
warehouse offer → SME order → warehouse confirmation → private invoice PDF.
Verify cross-business denial and finance permissions. Record payment only against
actual external payment evidence. Check these URLs after a server restart too.
The broader consumer workflows and older schema reconciliation remain separate.

## 6. Roll back the application

Keep the previous release directory and registry images. From that directory:

```sh
cd /opt/sokoni/releases/PREVIOUS_RELEASE_ID
sudo docker compose --env-file release.env -f compose.yaml pull
sudo docker compose --env-file release.env -f compose.yaml up -d --wait
```

This restores the selected application images. It does not reverse database
changes or payments. Do not delete Caddy volumes or run migrations during rollback.
