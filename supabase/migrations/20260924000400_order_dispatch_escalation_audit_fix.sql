-- Reuse the delivery-issue audit trigger and classify staff escalations as dispatcher work.
create or replace function public.command_order_investigation(p_order_id uuid,p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  operation uuid := (p_input->>'operationId')::uuid;
  prior public.order_support_operations;
  order_record public.customer_checkouts;
  delivery_record public.deliveries;
  source public.notification_events;
  vendor_record public.vendor_orders;
  case_id uuid;
  phone text;
  recipient uuid;
  event_title text;
  event_body text;
  event_state text;
  root_event text;
  result jsonb;
  audit_details jsonb := '{}';
begin
  if operation is null or p_action is null or p_action not in ('notes','reveal-contact','resend-notification','escalate-dispatch','cancel') then
    raise exception 'Invalid order support command.' using errcode='22023'; end if;
  if not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role
    where s.user_id=p_actor and s.status='active' and r.permission=case when p_action='resend-notification' then 'notifications.manage' else 'orders.support' end)
    or not exists(select 1 from public.staff_members s join public.role_permissions r on r.role=s.role
      where s.user_id=p_actor and s.status='active' and r.permission='orders.read') then
    raise exception 'Order support permission required.' using errcode='42501'; end if;
  if p_action<>'notes' and coalesce(char_length(trim(p_input->>'reason')),0) not between 3 and 500 then
    raise exception 'A reason is required.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text,35));
  select * into prior from public.order_support_operations where operation_id=operation;
  if found then
    if prior.checkout_id<>p_order_id or prior.actor_id<>p_actor or prior.action<>p_action or prior.input<>p_input then
      raise exception 'Operation key was reused with another command.' using errcode='55000'; end if;
    return prior.response || jsonb_build_object('duplicate',true);
  end if;
  select * into order_record from public.customer_checkouts where id=p_order_id;
  if not found then raise exception 'Order not found.' using errcode='P0002'; end if;
  if p_action='notes' then
    if coalesce(char_length(trim(p_input->>'note')),0) not between 3 and 2000 then
      raise exception 'A note of 3 to 2000 characters is required.' using errcode='22023'; end if;
    insert into public.order_support_notes(checkout_id,author_id,note) values(p_order_id,p_actor,trim(p_input->>'note')) returning id into case_id;
    audit_details:=jsonb_build_object('noteId',case_id);
    result:=jsonb_build_object('id',case_id,'status','recorded');
  elsif p_action='cancel' then
    perform public.cancel_order(p_order_id,p_actor,trim(p_input->>'reason'));
    result:=jsonb_build_object('status','cancelled');
  elsif p_action in ('reveal-contact','escalate-dispatch') then
    select d.* into delivery_record from public.deliveries d join public.delivery_groups g on g.id=d.delivery_group_id where g.checkout_id=p_order_id for update of d;
    if p_action='reveal-contact' then
      if p_input->>'target'='consumer' then
        recipient:=order_record.consumer_id;
        select phone_number into phone from public.checkout_fulfilments where checkout_id=p_order_id;
      elsif p_input->>'target'='rider' and delivery_record.assigned_transporter_id is not null then
        select u.id,u.phone into recipient,phone from public.transporter_profiles t join auth.users u on u.id=t.user_id where t.id=delivery_record.assigned_transporter_id;
      else raise exception 'The requested order contact is not available.' using errcode='55000'; end if;
      if nullif(phone,'') is null then raise exception 'The requested order contact is not available.' using errcode='55000'; end if;
      audit_details:=jsonb_build_object('target',p_input->>'target','contactUserId',recipient);
      result:=jsonb_build_object('status','revealed','phoneNumber',phone);
    else
      if delivery_record.id is null or delivery_record.status in ('delivered','returned','delivery_failed','assignment_cancelled') then
        raise exception 'A linked active delivery is required for dispatch escalation.' using errcode='55000'; end if;
      if (p_input->>'expectedDeliveryVersion')::integer is distinct from delivery_record.version then
        raise exception 'Delivery changed; refresh before escalating.' using errcode='40001'; end if;
      insert into public.delivery_issues(delivery_id,reported_by_user_id,reason,note,reported_delivery_status,reported_delivery_version)
        values(delivery_record.id,p_actor,'OTHER',trim(p_input->>'reason'),delivery_record.status,delivery_record.version) returning id into case_id;
      insert into public.delivery_issue_operations(operation_id,delivery_issue_id,actor_user_id,action) values(operation,case_id,p_actor,'reported');
      update public.delivery_operations set actor_type='dispatcher',
        metadata=metadata||jsonb_build_object('orderId',p_order_id,'supportEscalation',true)
        where operation_id=operation;
      update public.delivery_audit_events set actor_type='dispatcher',action='delivery.support_escalated',
        details=details||jsonb_build_object('orderId',p_order_id)
        where delivery_id=delivery_record.id and operation_id=operation;
      audit_details:=jsonb_build_object('deliveryId',delivery_record.id,'issueId',case_id);
      result:=audit_details||jsonb_build_object('status','open');
    end if;
  else
    select * into source from public.notification_events where id=(p_input->>'notificationId')::uuid for update;
    if not found or source.user_id<>order_record.consumer_id then
      raise exception 'Order notification not found.' using errcode='P0002'; end if;
    if source.entity_type='vendor_order' then
      select * into vendor_record from public.vendor_orders where id=source.entity_id and checkout_id=p_order_id for share;
      if not found then raise exception 'Order notification not found.' using errcode='P0002'; end if;
      event_state:=vendor_record.status::text;
      if source.event_type<>'vendor_order.'||event_state or event_state not in ('accepted','preparing','quality_verified','ready_for_pickup','cancelled','issue_reported') then
        raise exception 'Only a current approved notification template can be resent.' using errcode='55000'; end if;
      event_title:=case event_state when 'accepted' then 'Order accepted' when 'preparing' then 'Order is being prepared' when 'quality_verified' then 'Order quality verified' when 'ready_for_pickup' then 'Order ready for pickup' when 'cancelled' then 'Order cancelled' else 'Order needs attention' end;
      event_body:='Seller order '||vendor_record.reference||' is now '||replace(event_state,'_',' ')||'.';
    elsif source.entity_type='delivery' then
      select d.* into delivery_record from public.deliveries d join public.delivery_groups g on g.id=d.delivery_group_id where d.id=source.entity_id and g.checkout_id=p_order_id for share of d;
      if not found then raise exception 'Order notification not found.' using errcode='P0002'; end if;
      event_state:=delivery_record.status::text;
      if source.event_type not in ('delivery.status_changed','delivery.completed') or source.payload->>'status' is distinct from event_state or event_state not in ('arrived_at_market','picked_up','in_transit','arrived_at_customer','delivered') then
        raise exception 'Only a current approved notification template can be resent.' using errcode='55000'; end if;
      event_title:=case event_state when 'arrived_at_market' then 'Rider at the market' when 'picked_up' then 'Order collected' when 'in_transit' then 'Order on the way' when 'arrived_at_customer' then 'Rider has arrived' else 'Delivery completed' end;
      event_body:=case event_state when 'arrived_at_market' then 'Your rider is collecting the seller orders.' when 'picked_up' then 'Every seller handover is confirmed.' when 'in_transit' then 'Your order is travelling to your delivery address.' when 'arrived_at_customer' then 'Meet your rider and check the order before confirming delivery.' else 'Delivery was confirmed with your PIN and private evidence is available in your order.' end;
    else raise exception 'This notification template cannot be resent.' using errcode='55000'; end if;
    root_event:=coalesce(source.payload->>'resendOf',source.id::text);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(root_event,36));
    if exists(select 1 from public.notification_events where payload->>'resendOf'=root_event and created_at>now()-interval '60 seconds') then
      raise exception 'Wait 60 seconds before resending this notification again.' using errcode='55000'; end if;
    insert into public.notification_events(user_id,event_type,entity_type,entity_id,title,body,priority,payload,dedupe_key)
      values(source.user_id,source.event_type,source.entity_type,source.entity_id,event_title,event_body,source.priority,
        jsonb_build_object('checkoutId',p_order_id,'status',event_state,'resendOf',root_event,
          'sellerOrderId',vendor_record.id,'deliveryId',delivery_record.id),'order-support:'||operation::text) returning id into case_id;
    insert into public.notification_deliveries(event_id,channel) values(case_id,'push');
    insert into public.notification_audit_events(notification_event_id,action,details)
      values(case_id,'notification.support_resend',jsonb_build_object('actorId',p_actor,'operationId',operation,'originalEventId',source.id));
    audit_details:=jsonb_build_object('notificationId',source.id,'queuedEventId',case_id);
    result:=jsonb_build_object('id',case_id,'status','queued');
  end if;
  insert into public.order_support_audit_events(checkout_id,actor_id,operation_id,action,reason,previous_status,next_status,details)
    values(p_order_id,p_actor,operation,'order.'||replace(p_action,'-','_'),case when p_action='notes' then null else trim(p_input->>'reason') end,
      order_record.status,case when p_action='cancel' then 'cancelled'::public.checkout_status else order_record.status end,audit_details);
  -- Every reveal is audited; never store phone numbers in operation replay or audit payloads.
  insert into public.order_support_operations(operation_id,checkout_id,actor_id,action,input,response)
    values(operation,p_order_id,p_actor,p_action,p_input,result-'phoneNumber') on conflict(operation_id) do nothing;
  return result||jsonb_build_object('orderId',p_order_id,'duplicate',false);
end; $$;
