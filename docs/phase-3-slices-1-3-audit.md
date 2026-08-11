# Phase 3 inventory and transaction audit

Audited on 2026-08-08 against the migrations in `supabase/migrations`.

## Existing state

| Phase 3 object                     | Existing state                                                                             | Decision                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `listings`                         | Has package size, approved price, status, availability and version; no countable inventory | Extend in place                                                       |
| `create_checkout_from_cart`        | Absent                                                                                     | Defer to Slice 4                                                      |
| `inventory_reservations`           | Absent                                                                                     | Defer creation until its checkout/order foreign keys exist in Slice 4 |
| `carts` / `cart_items`             | Absent                                                                                     | Create for Slice 3                                                    |
| customer checkouts / vendor orders | Absent                                                                                     | Defer to Slice 4                                                      |
| transaction indexes                | Catalogue indexes only                                                                     | Add inventory and active-cart indexes                                 |
| RLS                                | Catalogue tables use RLS; writes are made through service-role functions                   | Enable RLS on carts and expose no direct client grants                |

## Requirement mismatches

- Availability was manually writable and could disagree with real inventory.
- There was no `stock_on_hand - stock_reserved` invariant or package-count constraint.
- Catalogue views could expose an `available` listing with zero stock.
- No guest-token hashing or cart ownership boundary existed.
- No deterministic merge, adjustment reporting, cart versioning, or server-side validation existed.
- Checkout locking, reservations, expiry, immutable order snapshots and idempotency are not present and remain work for Slices 4–6.

## Implementation choices for Slices 2–3

- Counts are stored on `listings`; available stock is generated from the two authoritative counts.
- Availability is synchronized from available stock using the listing threshold. Manual vendor availability changes map to count-safe values rather than bypassing inventory.
- Raw guest tokens never enter PostgreSQL. The API hashes them with SHA-256 and compares only the digest.
- Cart mutations and merge execute in security-definer PostgreSQL functions, lock affected rows, enforce ownership, and increment the cart version.
- Direct cart table access remains denied. The Express API is the public boundary.
