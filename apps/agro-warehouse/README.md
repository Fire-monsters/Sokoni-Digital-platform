# agro-warehouse

This app opens as a local demo without login or API configuration. Sample records and simulated actions are held in memory and reset on reload. Live API and Supabase environment variables are not used.

Run `pnpm --filter agro-warehouse dev` from the repository root.

No live payments, notifications, or business records are changed. Invoice PDF downloads are unavailable in the warehouse demo. Existing placeholder pages remain placeholders. SME and mobile authentication and backend authorization are unchanged.

Restoring live workflows requires reconnecting the app-local data services and introducing the revised authentication and business rules.

Validation: `pnpm --filter agro-warehouse test` and `pnpm --filter agro-warehouse build`. Run `pnpm --filter agro-warehouse typecheck` for type checks.
