create or replace function public.normalize_sensitive_audit_action(p_source text, p_action text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_source = 'catalogue' and p_action = 'listing.approve' then 'catalogue.listing_approved'
    when p_source = 'catalogue' and p_action = 'listing.request_changes' then 'catalogue.listing_changes_requested'
    when p_source = 'catalogue' and p_action = 'price_request.approve' then 'catalogue.price_change_approved'
    when p_source = 'catalogue' and p_action = 'price_request.reject' then 'catalogue.price_change_rejected'
    when p_source = 'delivery' and p_action = 'delivery.manually_assigned' then 'delivery.rider_assigned'
    when p_source = 'delivery' and p_action = 'delivery.reassigned' then 'delivery.rider_reassigned'
    when p_source = 'application' and p_action in ('start-review','application.start-review','application.start_review','application.application.start-review','application.application.start_review') then 'application.review_started'
    when p_source = 'application' and p_action in ('approve','application.approve','application.application.approve') then 'application.approved'
    when p_source = 'application' and p_action in ('reject','application.reject','application.application.reject') then 'application.rejected'
    when p_source = 'application' and p_action in ('request-changes','application.request-changes','application.request_changes','application.application.request_changes') then 'application.changes_requested'
    when p_source = 'application' and p_action in ('suspend','application.suspend','application.application.suspend') then 'application.suspended'
    when p_source = 'application' and p_action in ('notes','application.notes','application.application.notes') then 'application.support_note_added'
    when p_source = 'application' and p_action like 'application.%' then replace(p_action, '-', '_')
    when p_source = 'application' then 'application.' || replace(p_action, '-', '_')
    when p_source = 'payment' and p_action = 'payment.flag_investigation' then 'payment.investigation_flagged'
    when p_source = 'payment' and p_action = 'payment.request_refund' then 'payment.refund_requested'
    when p_source = 'order_support' and p_action = 'notes' then 'order.support_note_added'
    when p_source = 'order_support' and p_action = 'resend-notification' then 'order.notification_resent'
    when p_source = 'order_support' and p_action = 'reveal-contact' then 'order.contact_revealed'
    when p_source = 'order_support' and p_action = 'escalate-dispatch' then 'order.dispatch_escalated'
    when p_source = 'order_support' and p_action = 'cancel' then 'order.cancelled'
    else p_action
  end;
$$;

-- This one-time migration normalizes rows backfilled before the vocabulary was final.
alter table public.audit_events disable trigger audit_events_immutable;
update public.audit_events
set action = public.normalize_sensitive_audit_action(source_type, action)
where source_type = 'application'
  or (source_type = 'payment' and action in ('payment.flag_investigation','payment.request_refund'));
alter table public.audit_events enable trigger audit_events_immutable;
