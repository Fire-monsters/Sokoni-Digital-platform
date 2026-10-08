<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Layers: `src/models` (types) → `src/mocks` (fixtures, only imported by `src/services`) → `src/features/*` (pure business logic & status transitions) → `src/services` (async API, localStorage persistence) → `src/hooks` (React Query wrappers) → `src/components` / `src/routes` (presentation). Why: services can later be swapped for server-backed calls without touching UI.
- UI never imports fixtures or mutates data directly; all writes go through services which apply pure `features` functions. Why: keeps calculations testable and replaceable.
- Inventory tracks stock units (kg/pack/bunch); purchases are in packages and converted on receive. Why: explicit units and single-receive guarantee.
- Sales orders reserve stock on accept, deduct on completion, release on reject. Why: prevents overselling.
