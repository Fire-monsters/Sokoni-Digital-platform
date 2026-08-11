-- Phase 5 Slice 2a: commit the enum additions before functions use them.

alter type public.vendor_order_status add value if not exists 'awaiting_vendor_acceptance' after 'confirmed';
alter type public.vendor_order_status add value if not exists 'accepted' after 'awaiting_vendor_acceptance';
alter type public.vendor_order_status add value if not exists 'preparing' after 'accepted';
alter type public.vendor_order_status add value if not exists 'quality_verified' after 'preparing';
alter type public.vendor_order_status add value if not exists 'ready_for_pickup' after 'quality_verified';
alter type public.vendor_order_status add value if not exists 'issue_reported' after 'ready_for_pickup';
