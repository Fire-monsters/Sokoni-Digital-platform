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
- Do not create a database, real authentication, payment integration,
  server functions
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
