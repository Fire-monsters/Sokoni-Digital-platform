# E-Katale (Sokoni Digital)

E-Katale is a multi-sided local marketplace for buying fresh produce,
ready-to-cook food, and household essentials from trusted vendors. The platform
supports the complete order journey across four role-specific applications:

- consumers browse the catalogue, manage carts, check out, pay, and track orders;
- vendors manage listings, inventory, fulfilment, and order quality checks;
- riders accept delivery offers and manage pickup, delivery, and proof of delivery;
- operations staff approve listings, monitor payments, and dispatch deliveries.

The project is a TypeScript monorepo managed with pnpm workspaces and
Turborepo. Supabase provides PostgreSQL, authentication, and storage, while an
Express API keeps privileged operations and business rules off client devices.

## Technology stack

- **Mobile:** Expo, React Native, and Expo Router
- **Operations dashboard:** React and Vite
- **API:** Express and TypeScript
- **Data platform:** Supabase (PostgreSQL, Auth, and Storage)
- **State and validation:** TanStack Query, Zustand, and Zod
- **Tooling:** pnpm, Turborepo, ESLint, Prettier, and Vitest

## Repository structure

```text
apps/
  api/                 Express API
  consumer-mobile/     Consumer Expo application
  vendor-mobile/       Vendor Expo application
  rider-mobile/        Rider Expo application
  operations-web/      Operations dashboard
packages/              Shared domain, UI, auth, validation, and API packages
tooling/               Shared TypeScript and ESLint configuration
supabase/              Local Supabase configuration, migrations, and DB tests
docs/                  Implementation notes, audits, and release runbooks
```

## Prerequisites

Install the following on the development machine:

- Git
- Node.js 22
- Corepack (included with most Node.js distributions)
- Docker Engine or Docker Desktop, running before Supabase is started
- PostgreSQL client tools (`psql`) if you want to run the database concurrency tests

For native mobile development, also install Android Studio for Android or Xcode
on macOS for iOS. Expo apps can otherwise be opened in a supported development
client or run in a browser.

## Set up a new development machine

Clone the repository and enter it:

```bash
git clone <repository-url>
cd sokoni-digital
```

Enable Corepack and install the exact dependency versions from the lockfile:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Create the local environment file:

```bash
cp .env.example .env
```

Start Supabase and apply all migrations to a clean local database:

```bash
pnpm db:start
pnpm db:reset
pnpm db:status
```

Use the values printed by `pnpm db:status` to fill in these required entries in
`.env`:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<local publishable or anon key>
SUPABASE_SECRET_KEY=<local secret or service-role key>
SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json

EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local publishable or anon key>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable or anon key>
```

The default fake payment provider does not require Pesapal credentials. Google
Maps, Expo push, and SMS credentials are also optional for basic local
development. Never put `SUPABASE_SECRET_KEY` or any service-role key in an
`EXPO_PUBLIC_*` or `VITE_*` variable, and never commit `.env`.

## Run the project

The root `.env` is the shared source of local configuration. Because each app
runs from its own workspace directory, export that file in every new terminal
before starting a process:

```bash
set -a
source .env
set +a
```

Then run each service you need in a separate terminal.

API (port `4000`):

```bash
pnpm --dir apps/api dev
```

Check that it is running at <http://localhost:4000/health>.

Operations dashboard (normally port `5173`):

```bash
pnpm --dir apps/operations-web dev
```

Consumer app:

```bash
pnpm --dir apps/consumer-mobile exec expo start --clear --port 8081
```

Rider app:

```bash
pnpm --dir apps/rider-mobile exec expo start --clear --port 8082
```

Vendor app:

```bash
pnpm --dir apps/vendor-mobile exec expo start --clear --port 8083
```

The root command below starts all workspaces with a `dev` script, but separate
terminals are usually easier when working with multiple Expo apps:

```bash
pnpm dev
```

### Mobile host addresses

`localhost` refers to the device on which an app is running, so update the
public URLs in `.env` when necessary:

- Web and the iOS Simulator can generally use `127.0.0.1`.
- The Android Emulator reaches the development machine through `10.0.2.2`; use
  `http://10.0.2.2:4000` for the API and `http://10.0.2.2:54321` for Supabase.
- A physical phone must use the development machine's reachable LAN IP address.
  The phone and computer must be on the same network, and the relevant ports
  must be allowed through the firewall.

Restart Expo after changing an `EXPO_PUBLIC_*` variable.

## Useful commands

Run these commands from the repository root:

| Command             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `pnpm dev`          | Start development tasks across the monorepo       |
| `pnpm build`        | Build all applications and packages               |
| `pnpm lint`         | Run ESLint across the monorepo                    |
| `pnpm typecheck`    | Run TypeScript checks                             |
| `pnpm test`         | Run the test suites                               |
| `pnpm test:ci`      | Run CI tests with configured coverage             |
| `pnpm format`       | Format files with Prettier                        |
| `pnpm format:check` | Check formatting without changing files           |
| `pnpm validate`     | Run formatting, linting, types, tests, and builds |
| `pnpm db:start`     | Start the local Supabase stack                    |
| `pnpm db:status`    | Show local Supabase URLs and credentials          |
| `pnpm db:reset`     | Rebuild the local database from migrations        |
| `pnpm db:test`      | Run Supabase database tests                       |
| `pnpm db:types`     | Regenerate checked-in TypeScript database types   |
| `pnpm db:stop`      | Stop the local Supabase stack                     |

To target one workspace, use `pnpm --dir <workspace> <script>` or
`pnpm --filter <package-name> <script>`.

## Local development notes

- Supabase Studio is available at <http://127.0.0.1:54323> while the local stack
  is running.
- The operations dashboard currently expects an ordinary Supabase access token
  with an `admin` or `agent` role; it does not provide its own login screen.
- There is no checked-in seed file, so a database reset creates the schema but
  not reusable marketplace accounts or catalogue data.
- Local payments use `PAYMENTS_ENV=fake`. Pesapal credentials and an HTTPS
  callback URL are required when switching to sandbox or production payments.
- For production configuration, native builds, credentials, deployment, and
  full ecosystem testing, see
  [`docs/phase-6-release-and-testing-runbook.md`](docs/phase-6-release-and-testing-runbook.md).

## Troubleshooting

**The API reports invalid server environment values:** confirm Supabase is
running, copy the current keys from `pnpm db:status` into `.env`, and export the
file in the API terminal before starting it.

**A mobile app cannot reach the API or Supabase:** do not use `localhost` from
an Android emulator or physical device. Use the host address described above,
then restart Expo with `--clear`.

**Supabase does not start:** confirm Docker is running and that ports
`54320`-`54323` are free, then retry `pnpm db:start`.

**Dependencies differ from CI:** use Node.js 22 and rerun
`pnpm install --frozen-lockfile`; the repository pins its pnpm version through
the root `package.json`.
