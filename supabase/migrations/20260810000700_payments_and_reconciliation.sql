-- Phase 4 slices 1-2: provider-neutral payment persistence and reconciliation evidence.

alter type public.checkout_status add value if not exists 'payment_failed' after 'awaiting_payment';

alter table public.customer_checkouts
  add constraint customer_checkouts_id_consumer_unique unique (id, consumer_id);

create type public.payment_provider as enum (
  'pesapal',
  'market_pickup'
);

create type public.payment_method as enum (
  'mtn_momo',
  'airtel_money',
  'visa',
  'mastercard',
  'card',
  'bank',
  'market_pickup',
  'unknown'
);

create type public.payment_status as enum (
  'created',
  'initiating',
  'pending',
  'successful',
  'failed',
  'cancelled',
  'expired',
  'requires_reconciliation'
);

create type public.payment_event_processing_status as enum (
  'received',
  'verified',
  'processed',
  'duplicate',
  'rejected',
  'failed'
);

create type public.reconciliation_result as enum (
  'matched',
  'status_updated',
  'amount_mismatch',
  'reference_mismatch',
  'provider_not_found',
  'manual_review_required',
  'no_change'
);

create sequence public.payment_reference_sequence;

create table public.payment_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  checkout_id uuid not null,
  consumer_id uuid not null references auth.users(id),
  provider public.payment_provider not null,
  payment_method public.payment_method,
  status public.payment_status not null default 'created',
  amount_ugx bigint not null check (amount_ugx > 0),
  currency_code text not null default 'UGX' check (currency_code = 'UGX'),
  payer_phone_e164 text,
  merchant_reference text not null unique,
  provider_transaction_id text,
  provider_request_reference text,
  provider_confirmation_code text,
  provider_redirect_url text,
  failure_code text,
  failure_message text,
  initiated_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz,
  next_reconciliation_at timestamptz,
  reconciliation_claimed_until timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempt_checkout_owner_fk
    foreign key (checkout_id, consumer_id)
    references public.customer_checkouts(id, consumer_id),
  constraint payment_attempt_phone_shape check (
    (provider = 'market_pickup' and payer_phone_e164 is null)
    or (provider = 'pesapal' and (
      payer_phone_e164 is null or payer_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'
    ))
  ),
  constraint payment_attempt_method_shape check (
    (provider = 'market_pickup' and payment_method = 'market_pickup')
    or (provider = 'pesapal' and payment_method is distinct from 'market_pickup')
  ),
  constraint payment_attempt_resolution_shape check (
    (status in ('successful', 'failed', 'cancelled', 'expired') and resolved_at is not null)
    or (status not in ('successful', 'failed', 'cancelled', 'expired') and resolved_at is null)
  ),
  constraint payment_attempt_failure_shape check (
    status = 'failed' or (failure_code is null and failure_message is null)
  ),
  unique (id, provider)
);

create table public.payment_provider_events (
  id uuid primary key default extensions.gen_random_uuid(),
  provider public.payment_provider not null,
  payment_method public.payment_method,
  provider_event_id text,
  provider_transaction_id text,
  merchant_reference text,
  request_id text,
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  headers_redacted jsonb,
  signature_verified boolean not null default false,
  authenticity_verified_at timestamptz,
  verification_method text check (
    verification_method is null or verification_method in ('provider_status_lookup', 'signature')
  ),
  processing_status public.payment_event_processing_status not null default 'received',
  rejection_reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_provider_event_processed_shape check (
    (processing_status in ('processed', 'duplicate', 'rejected', 'failed') and processed_at is not null)
    or (processing_status in ('received', 'verified') and processed_at is null)
  ),
  constraint payment_provider_event_rejection_shape check (
    processing_status = 'rejected' or rejection_reason is null
  ),
  unique (provider, payload_hash)
);

create table public.payment_reconciliation_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_attempt_id uuid not null,
  provider public.payment_provider not null,
  previous_status public.payment_status not null,
  provider_status text,
  result public.reconciliation_result not null,
  provider_amount_ugx bigint check (provider_amount_ugx is null or provider_amount_ugx >= 0),
  provider_currency text,
  provider_response jsonb,
  run_source text not null check (
    run_source in ('scheduled_job', 'admin_request', 'consumer_status_check', 'callback_recovery')
  ),
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint payment_reconciliation_attempt_provider_fk
    foreign key (payment_attempt_id, provider)
    references public.payment_attempts(id, provider)
);

create table public.payment_audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id),
  provider_event_id uuid references public.payment_provider_events(id),
  actor_user_id uuid references auth.users(id),
  action text not null,
  previous_status public.payment_status,
  next_status public.payment_status,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payment_audit_transition_shape check (
    previous_status is not null or next_status is not null or details <> '{}'::jsonb
  )
);

create index payment_attempts_checkout_idx
  on public.payment_attempts (checkout_id, created_at desc);
create unique index payment_attempts_provider_transaction_idx
  on public.payment_attempts (provider, provider_transaction_id)
  where provider_transaction_id is not null;
create unique index payment_attempts_one_success_per_checkout_idx
  on public.payment_attempts (checkout_id)
  where status = 'successful';
create index payment_attempts_pending_reconciliation_idx
  on public.payment_attempts (provider, next_reconciliation_at, updated_at)
  where status in ('pending', 'requires_reconciliation');
create unique index payment_provider_events_provider_event_idx
  on public.payment_provider_events (provider, provider_event_id)
  where provider_event_id is not null;
create index payment_provider_events_reference_idx
  on public.payment_provider_events (provider, merchant_reference, received_at desc);
create index payment_reconciliation_attempt_idx
  on public.payment_reconciliation_runs (payment_attempt_id, created_at desc);
create index payment_audit_attempt_idx
  on public.payment_audit_events (payment_attempt_id, created_at, id);

create trigger payment_attempts_set_updated_at before update on public.payment_attempts
for each row execute function public.set_updated_at();

alter table public.payment_attempts enable row level security;
alter table public.payment_provider_events enable row level security;
alter table public.payment_reconciliation_runs enable row level security;
alter table public.payment_audit_events enable row level security;

create policy payment_attempts_owner_read on public.payment_attempts for select
to authenticated using (consumer_id = auth.uid());

grant select on public.payment_attempts to authenticated;

comment on table public.payment_attempts is
  'Immutable-value collection attempts; a checkout may be retried but may succeed only once.';
comment on table public.payment_provider_events is
  'Raw provider evidence retained for callback authentication, deduplication and audit.';
comment on table public.payment_reconciliation_runs is
  'Append-only evidence from provider status lookups.';
comment on table public.payment_audit_events is
  'Append-only normalized payment lifecycle audit trail.';
