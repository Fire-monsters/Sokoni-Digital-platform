# operations-web

The Operations screens for applications, catalogue, price changes, deliveries, orders, payment records and refund requests use the public Operations API and persisted Supabase data. Set `VITE_API_URL` to the backend origin (blank means same-origin). The backend must run in `APP_MODE=full` with its public Operations workspace configured to an active staff actor. The browser never supplies actor credentials.

Run `pnpm --filter operations-web dev`. For local fixture development only, set `VITE_DEMO_ENABLED=true`; production builds always disable fixtures and local mutations. Provider payment rechecks, refund execution, notifications and external fleet functions remain unavailable.

See [the Epic 3 implementation report](../../docs/implementation/epic-3-operations-reconnection.md) for routes, persistence and audit details.

Validation: `pnpm --filter operations-web typecheck`, `pnpm --filter operations-web test`, and `pnpm --filter operations-web build`.
