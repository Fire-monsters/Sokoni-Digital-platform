# Epic 2 — Crop catalogue and business preferences

Implemented on the existing Express/Supabase backend. All endpoints require a
valid Supabase bearer token and return the existing success/error envelope.

## Canonical catalogue

| Table                           | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `agricultural_products`         | One UUID per product; unique slug and active flag.            |
| `product_categories`            | `CASH` and `FOOD` codes with display names.                   |
| `product_category_memberships`  | Unique `(product_id, category)` membership with foreign keys. |
| `business_category_preferences` | Selected category codes per business.                         |
| `business_product_preferences`  | Selected canonical product UUIDs per business.                |

The three initial products are coffee, maize and coconut. All three belong to
`CASH`; maize also belongs to `FOOD`. There are no `maize_cash` or `maize_food`
products. Classifications can be maintained through privileged database access;
clients cannot create taxonomy entries.

- `GET /v1/agriculture/categories` returns `[{"code":"CASH","name":"Cash crops"}, {"code":"FOOD","name":"Food crops"}]` inside `data`.
- `GET /v1/agriculture/products` returns active products as `{id, slug, name, categories}`.
- Optional `?category=CASH` or `?category=FOOD` filters by membership. Without a
  filter each product appears once, even if it has two categories.

## Business preferences

`GET /v1/me/businesses/:id/preferences` returns:

```json
{
  "success": true,
  "data": {
    "businessId": "<business UUID>",
    "version": 2,
    "categories": ["CASH", "FOOD"],
    "productIds": ["<maize UUID>"]
  },
  "meta": { "requestId": "<request ID>" }
}
```

An active business member can read preferences. The verified owner can replace
them with `PUT /v1/me/businesses/:id/preferences`:

```json
{
  "operationId": "<new UUID>",
  "expectedVersion": 2,
  "categories": ["FOOD"],
  "productIds": ["<maize UUID>"]
}
```

PUT returns the same preference shape as GET, with the new business version.
Both category and product selections are replaced atomically. Select one or both
categories and at least one active product belonging to a selected category.
Unknown products, duplicates, invalid categories and mismatched product/category
selections fail validation without partially updating the business.

- Lowercase `cash`/`food` inputs remain accepted and normalize to uppercase.
- Mixed-case duplicates such as `CASH` plus `cash` are rejected.
- Stale `expectedVersion` returns 409. Retry identical requests with the same
  operation ID; use a new ID after changing the request body.
- Rejected/suspended businesses cannot edit preferences.
- Preferences personalize analytics defaults; they do not change product
  identities, commercial eligibility, order contents or historical operation
  snapshots. Actual sales/demand analytics remain a later slice.
- The legacy `PUT .../product-preferences` URL remains an alias returning the
  original full-business response shape; category codes are now uppercase.

The shared API client exposes `fetchAgriculturalCategories`,
`fetchAgriculturalProducts`, `fetchBusinessPreferences` and
`updateBusinessPreferences`. The latter uses the new endpoint and returns the
preference-specific result. Business/analytics-context reads also expose the
canonical uppercase codes.

## Migration and verification

Apply `20261002000200_canonical_crop_catalogue.sql` after the existing business
migration. It renames existing membership/preference tables in place and
canonicalizes category codes without changing product/business IDs.

Earlier extra seed products are removed only when no business preference or
historical business operation references them. Referenced old products remain
archived, so old selections/results stay resolvable. Fresh databases end with
exactly coffee, maize and coconut. Already applied migrations are not rewritten.
Deploy the updated API and shared client with this schema change.

SQL regressions, against an isolated database after migrations:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/business_accounts.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/crop_catalogue_preferences.sql
```

The tests roll back fixtures and cover category overlap, all three selection
modes, history preservation, inactive/unknown/mismatched products, atomic errors,
access isolation, RLS, version conflicts and idempotent replay. API tests cover
the new endpoints, legacy input normalization and authorization error handling.
