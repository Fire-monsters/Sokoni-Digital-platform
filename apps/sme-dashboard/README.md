# SME Dashboard

Build an interactive frontend prototype for Sokoni Digital.

Technical target:

- React, TypeScript and Vite, using client-side routing.
- Tailwind CSS, shadcn/ui, Lucide icons and Recharts.
- Use pnpm for dependency installation and all documented commands.
- Set packageManager to pnpm@11.20.0.
- Prefer pnpm-lock.yaml; do not deliberately introduce npm, Yarn or Bun
  lockfiles. If your hosted environment requires a different package
  manager or framework, explain that limitation.
- Provide dev, build, lint, typecheck and test scripts.
- This project is part of the pnpm/Turborepo workspace under
  apps/sme-dashboard. Install dependencies from the repository root.
- Do not reference unavailable workspace packages.

Architecture:

- Separate pages, reusable components, feature logic, TypeScript models,
  mock fixtures and asynchronous service functions.
- UI components must call the service layer, not import fixtures directly.
- Use local mock data and localStorage for demo changes.
- Include reset-demo functionality.
- Business authentication uses the API; inventory, trading and analytics remain
  local demo workflows. Do not add payment integration or database provisioning.
- Keep business calculations and status transitions out of presentation
  components so they can later be replaced by server-backed services.

Design:

- Professional, clear marketplace dashboard with readable tables.
- Primary #1F7A4D, dark green #145C39, accent #FFC83D,
  background #F8FAF8, text #17211B.
- Responsive desktop, tablet and mobile layouts.
- UGX currency, Uganda sample businesses and East Africa Time.
- Accessible forms, keyboard interaction and visible focus states.
- Include loading, empty, error and success states.
- Every visible action must work in the demo or explain why it is disabled.
- Charts, KPIs and tables must use the same underlying demo records.

First build the navigation, visual system and overview page.
Then implement the module workflows incrementally.

The package name is sme-dashboard.
The user is one SME business that buys wholesale and sells to consumers.
Provide Buy and Sell navigation groups with shared inventory.
Implement this demo journey:Browse wholesale products -> create purchase order -> receive stock -> create a consumer listing -> accept consumer order -> prepare -> ready for pickup.
Keep purchase orders and consumer sales orders distinct.
Receiving stock must update inventory once, and sales reservations must prevent overselling.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f148e692-95c6-49a8-937f-4cfef8df87a1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and pnpm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
pnpm install
pnpm --filter sme-dashboard dev
```

## Business authentication

Copy `.env.example` to `.env.local` and set `VITE_API_URL` to the API origin.
Start the API with the Supabase migrations and SMS provider configuration described
in [Dashboard business authentication](../../docs/dashboard-business-auth.md).
No Supabase secret belongs in a `VITE_*` variable.

Routes: `/auth/register` → `/auth/verify` → workspace; existing users use
`/auth/login`. Dashboard pages require a verified session and preserve the requested
page and filters through login. Unverified users can resume verification from the
login screen without storing their password. SMS resends use a 60-second cooldown
and respect the API's `Retry-After` response.

The service stores rotated tokens in **sessionStorage** for the current browser
tab, validates restored sessions through the refresh endpoint, refreshes before
expiry and revokes the current session on logout. Tokens are accessible to the
application's JavaScript; deploy over HTTPS and protect against XSS. Closing the
tab ends local persistence. Passwords and SMS codes are never persisted.

Authentication is real; the workspace still displays explicitly labelled demo
business data. Phone verification does not create a business application or grant
business approval. Business profile/crop onboarding is a separate implementation.

Checks: `pnpm --filter sme-dashboard typecheck`, `pnpm --filter sme-dashboard test`,
`pnpm --filter sme-dashboard build`. Test live SMS delivery, expired codes, login,
refresh and logout with a controlled staging account before release.
