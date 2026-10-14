# agro-warehouse

Operational screens show “Not connected yet” until the later API integration slices. The shared typed HTTP client and TanStack Query provider are ready for those integrations; domain workflows are not connected in this slice.

Run `pnpm --filter agro-warehouse dev`. Set `NEXT_PUBLIC_API_URL` to the public backend origin (blank means same-origin). For local demo development only, set `NEXT_PUBLIC_DEMO_ENABLED=true`. Production builds always disable demo records and local mutations, even if this flag is set.

No live payments, notifications or business records are changed. Operations provider rechecks and notification sends are unavailable even in demo mode. SME authentication and backend authorization are unchanged.

See [the Epic 2 implementation report](../../docs/implementation/epic-2-api-foundation.md) for client/hook examples, the fake-success audit, security checks and validation results.

Validation: `pnpm --filter agro-warehouse typecheck`, `pnpm --filter agro-warehouse test`, and `pnpm --filter agro-warehouse build`.
