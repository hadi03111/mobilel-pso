-- Mobile Shop Management System - secure production backend v4
create extension if not exists pgcrypto;

-- Extra production fields/tables
alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.repair_jobs add column if not exists labour_charge numeric(14,2) not null default 0;
alter table public.repair_jobs add column if not exists technician_earning_posted boolean not null default false;
alter table public.repair_jobs add column if not exists delivered_by uuid references public.profiles(id);
alter table public.repair_jobs add column if not exists updated_at timestamptz not null default now();
alter table public.technician_ledger add column if not exists balance_effect numeric(14,2) generated always as (
  case when entry_type in ('payment','deduction','reversal') then -amount else amount end
) stored;

create table if not exists public.sale_payments(
 id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id),
 amount numeric(14,2) not null check(amount>0), method text not null default 'Cash',
 received_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.repair_payments(
 id uuid primary key default gen_random_uuid(), repair_id uuid not null references public.repair_jobs(id),
 amount numeric(14,2) not null check(amount>0), method text not null default 'Cash',
 received_by uuid references public.profiles(id), reversed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.technician_settlements(
 id uuid primary key default gen_random_uuid(), technician_id uuid not null references public.profiles(id),
 amount numeric(14,2) not null check(amount>0), method text not null default 'Cash', note text,
 paid_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.repair_photos(
 id uuid primary key default gen_random_uuid(), repair_id uuid not null references public.repair_jobs(id) on delete cascade,
 storage_path text not null, photo_type text not null default 'condition', uploaded_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table if not exists public.app_settings(
 key text primary key, value jsonb not null default '{}'::jsonb, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);

-- Identity / authorization helpers
create or replace function public.current_profile_id() returns uuid language sql stable security definer set search_path=public as $$
 select auth.uid();
$$;
create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
 select role from public.profiles where id=auth.uid() and active=true;
$$;
create or replace function public.has_role(roles text[]) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.current_role()=any(roles),false);
$$;
create or replace function public.is_management() returns boolean language sql stable security definer set search_path=public as $$
 select public.has_role(array['Developer','Admin','Manager']);
$$;

-- Create profile automatically; privileged role changes remain protected by RLS.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,phone,role,active)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.raw_user_meta_data->>'phone','Cashier',true)
 on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Audit helper
create or replace function public.write_audit(p_action text,p_entity_type text,p_entity_id uuid default null,p_reason text default null,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason,metadata)
 values(auth.uid(),p_action,p_entity_type,p_entity_id,p_reason,coalesce(p_metadata,'{}'::jsonb));
end $$;

-- Secure purchase receipt: existing product or new product, all in one transaction.
create or replace function public.receive_purchase(
 p_product_id uuid, p_name text, p_category text, p_sku text, p_qty numeric, p_unit_cost numeric,
 p_low_stock numeric default 0, p_supplier_id uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_old_qty numeric; v_old_cost numeric; v_new_cost numeric;
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Not authorized to receive purchases'; end if;
 if p_qty<=0 or p_unit_cost<0 then raise exception 'Invalid quantity or cost'; end if;
 if p_product_id is null then
   insert into products(name,category,sku,cost,qty,low_stock,track_imei)
   values(trim(p_name),p_category,nullif(trim(p_sku),''),p_unit_cost,p_qty,coalesce(p_low_stock,0),lower(p_category)='phones') returning id into v_id;
 else
   select qty,cost into v_old_qty,v_old_cost from products where id=p_product_id and active=true for update;
   if not found then raise exception 'Product not found'; end if;
   v_new_cost:=case when v_old_qty+p_qty=0 then p_unit_cost else ((v_old_qty*v_old_cost)+(p_qty*p_unit_cost))/(v_old_qty+p_qty) end;
   update products set qty=qty+p_qty,cost=round(v_new_cost,2),low_stock=coalesce(p_low_stock,low_stock),updated_at=now() where id=p_product_id returning id into v_id;
 end if;
 insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,note,created_by)
 values(v_id,'PURCHASE_IN',p_qty,p_unit_cost,'purchase',coalesce(p_note,'Purchase received'),auth.uid());
 perform public.write_audit('PURCHASE_RECEIVED','product',v_id,p_note,jsonb_build_object('qty',p_qty,'unit_cost',p_unit_cost,'supplier_id',p_supplier_id));
 return v_id;
end $$;

-- Multi-item POS transaction. items = [{product_id, product_unit_id?, qty, sale_price}]
create or replace function public.complete_pos_sale_v2(
 p_items jsonb, p_customer_id uuid default null, p_paid numeric default null, p_payment_method text default 'Cash'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sale uuid:=gen_random_uuid(); v_invoice text; v_item jsonb; v_p products%rowtype; v_qty numeric; v_price numeric; v_subtotal numeric:=0; v_paid numeric; v_profit numeric:=0; v_unit uuid;
begin
 if not public.has_role(array['Developer','Admin','Manager','Cashier']) then raise exception 'Not authorized for POS'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
 v_invoice:='INV-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
 insert into sales(id,invoice_no,customer_id,cashier_id,subtotal,total,paid,status) values(v_sale,v_invoice,p_customer_id,auth.uid(),0,0,0,'Pending');
 for v_item in select * from jsonb_array_elements(p_items) loop
   v_qty:=coalesce((v_item->>'qty')::numeric,1); v_price:=(v_item->>'sale_price')::numeric; v_unit:=nullif(v_item->>'product_unit_id','')::uuid;
   select * into v_p from products where id=(v_item->>'product_id')::uuid and active=true for update;
   if not found then raise exception 'Product not found'; end if;
   if v_qty<=0 then raise exception 'Quantity must be positive'; end if;
   if v_p.qty<v_qty then raise exception 'Insufficient stock for %',v_p.name; end if;
   if v_price<v_p.cost then raise exception 'Sale price for % cannot be below cost PKR %',v_p.name,v_p.cost; end if;
   if v_p.track_imei and v_unit is null then raise exception 'IMEI/serial unit required for %',v_p.name; end if;
   if v_unit is not null then
      perform 1 from product_units where id=v_unit and product_id=v_p.id and status='In Stock' for update;
      if not found then raise exception 'Selected IMEI/serial is not available'; end if;
      update product_units set status='Sold' where id=v_unit;
   end if;
   insert into sale_items(sale_id,product_id,product_unit_id,qty,cost_snapshot,sale_price) values(v_sale,v_p.id,v_unit,v_qty,v_p.cost,v_price);
   update products set qty=qty-v_qty,updated_at=now() where id=v_p.id;
   insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note) values(v_p.id,'SALE_OUT',-v_qty,v_p.cost,'sale',v_sale,auth.uid(),'POS sale');
   v_subtotal:=v_subtotal+(v_qty*v_price); v_profit:=v_profit+(v_qty*(v_price-v_p.cost));
 end loop;
 v_paid:=coalesce(p_paid,v_subtotal); if v_paid<0 or v_paid>v_subtotal then raise exception 'Invalid payment amount'; end if;
 update sales set subtotal=v_subtotal,total=v_subtotal,paid=v_paid,status=case when v_paid>=v_subtotal then 'Paid' when v_paid>0 then 'Partially Paid' else 'Unpaid' end where id=v_sale;
 if v_paid>0 then insert into sale_payments(sale_id,amount,method,received_by) values(v_sale,v_paid,p_payment_method,auth.uid()); end if;
 perform public.write_audit('POS_SALE_COMPLETED','sale',v_sale,null,jsonb_build_object('invoice_no',v_invoice,'total',v_subtotal,'profit',v_profit));
 return jsonb_build_object('sale_id',v_sale,'invoice_no',v_invoice,'total',v_subtotal,'paid',v_paid,'profit',v_profit);
end $$;

-- Repair status machine
create or replace function public.valid_repair_transition(p_old text,p_new text) returns boolean language sql immutable as $$
 select case p_old
  when 'Received' then p_new in ('Assigned','Cancelled','Unrepairable')
  when 'Assigned' then p_new in ('Repairing','Ready for Handover','Cancelled','Unrepairable')
  when 'Repairing' then p_new in ('Ready for Handover','Cancelled','Unrepairable')
  when 'Ready for Handover' then p_new in ('Completed','Repairing')
  when 'Completed' then p_new in ('Delivered','Warranty')
  when 'Delivered' then p_new='Warranty'
  when 'Warranty' then p_new in ('Assigned','Repairing','Ready for Handover','Completed','Delivered')
  else false end;
$$;

create or replace function public.create_repair_job(
 p_customer_name text,p_customer_phone text,p_brand text,p_model text,p_imei text,p_complaint text,
 p_condition_notes text,p_accessories text,p_deadline timestamptz,p_technician_id uuid default null,p_estimate numeric default 0
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customer uuid; v_job uuid; v_no text; v_status text;
begin
 if not public.has_role(array['Developer','Admin','Manager','Cashier']) then raise exception 'Not authorized to receive repairs'; end if;
 select id into v_customer from customers where phone=nullif(trim(p_customer_phone),'') limit 1;
 if v_customer is null then insert into customers(name,phone) values(trim(p_customer_name),nullif(trim(p_customer_phone),'')) returning id into v_customer; end if;
 if p_technician_id is not null and not exists(select 1 from profiles where id=p_technician_id and role='Technician' and active) then raise exception 'Technician is not available'; end if;
 v_status:=case when p_technician_id is null then 'Received' else 'Assigned' end;
 v_no:='REP-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into repair_jobs(job_no,customer_id,brand,model,imei,complaint,condition_notes,accessories,deadline,technician_id,received_by,status,quote_total)
 values(v_no,v_customer,nullif(trim(p_brand),''),trim(p_model),nullif(trim(p_imei),''),trim(p_complaint),p_condition_notes,p_accessories,p_deadline,p_technician_id,auth.uid(),v_status,coalesce(p_estimate,0)) returning id into v_job;
 insert into repair_status_history(repair_id,status,changed_by,note) values(v_job,v_status,auth.uid(),'Device received face-to-face');
 if p_technician_id is not null then insert into notifications(user_id,title,text,kind) values(p_technician_id,'New repair assigned',v_no||' - '||p_model,'repair'); end if;
 perform public.write_audit('REPAIR_RECEIVED','repair_job',v_job,null,jsonb_build_object('job_no',v_no));
 return jsonb_build_object('repair_id',v_job,'job_no',v_no,'status',v_status);
end $$;

create or replace function public.change_repair_status(p_repair_id uuid,p_new_status text,p_note text default null)
returns text language plpgsql security definer set search_path=public as $$
declare v_job repair_jobs%rowtype;
begin
 select * into v_job from repair_jobs where id=p_repair_id for update; if not found then raise exception 'Repair not found'; end if;
 if public.current_role()='Technician' and v_job.technician_id<>auth.uid() then raise exception 'This repair is not assigned to you'; end if;
 if not public.has_role(array['Developer','Admin','Manager','Cashier','Technician']) then raise exception 'Not authorized'; end if;
 if not public.valid_repair_transition(v_job.status,p_new_status) then raise exception 'Invalid repair transition: % -> %',v_job.status,p_new_status; end if;
 update repair_jobs set status=p_new_status,updated_at=now(),completed_at=case when p_new_status='Completed' then now() else completed_at end,delivered_at=case when p_new_status='Delivered' then now() else delivered_at end,delivered_by=case when p_new_status='Delivered' then auth.uid() else delivered_by end where id=p_repair_id;
 insert into repair_status_history(repair_id,status,changed_by,note) values(p_repair_id,p_new_status,auth.uid(),p_note);
 perform public.write_audit('REPAIR_STATUS_'||upper(replace(p_new_status,' ','_')),'repair_job',p_repair_id,p_note);
 return p_new_status;
end $$;

-- Consume a repair part securely and deduct inventory.
create or replace function public.use_repair_part(p_repair_id uuid,p_product_id uuid,p_qty numeric,p_customer_charge numeric default 0)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_p products%rowtype; v_job repair_jobs%rowtype; v_id uuid;
begin
 select * into v_job from repair_jobs where id=p_repair_id for update; if not found then raise exception 'Repair not found'; end if;
 if public.current_role()='Technician' and v_job.technician_id<>auth.uid() then raise exception 'Repair is not assigned to you'; end if;
 if not public.has_role(array['Developer','Admin','Manager','Technician']) then raise exception 'Not authorized to consume parts'; end if;
 if v_job.status not in('Assigned','Repairing','Warranty') then raise exception 'Parts cannot be used at this repair stage'; end if;
 select * into v_p from products where id=p_product_id and active=true for update; if not found then raise exception 'Part not found'; end if;
 if p_qty<=0 or v_p.qty<p_qty then raise exception 'Insufficient part stock'; end if;
 insert into repair_parts(repair_id,product_id,qty,cost_snapshot,customer_charge,state) values(p_repair_id,p_product_id,p_qty,v_p.cost,coalesce(p_customer_charge,0),'Used') returning id into v_id;
 update products set qty=qty-p_qty,updated_at=now() where id=p_product_id;
 update repair_jobs set quote_total=quote_total+coalesce(p_customer_charge,0),status=case when status='Assigned' then 'Repairing' else status end,updated_at=now() where id=p_repair_id;
 insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note) values(p_product_id,'REPAIR_USE',-p_qty,v_p.cost,'repair',p_repair_id,auth.uid(),'Part used on repair');
 perform public.write_audit('REPAIR_PART_USED','repair_job',p_repair_id,null,jsonb_build_object('product_id',p_product_id,'qty',p_qty,'cost',v_p.cost,'charge',p_customer_charge));
 return v_id;
end $$;

create or replace function public.return_repair_part(p_repair_part_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_rp repair_parts%rowtype; v_job repair_jobs%rowtype;
begin
 select * into v_rp from repair_parts where id=p_repair_part_id for update; if not found then raise exception 'Repair part not found'; end if;
 select * into v_job from repair_jobs where id=v_rp.repair_id;
 if public.current_role()='Technician' and v_job.technician_id<>auth.uid() then raise exception 'Repair is not assigned to you'; end if;
 if v_rp.state<>'Used' then raise exception 'Part has already been returned/changed'; end if;
 update repair_parts set state='Returned' where id=p_repair_part_id;
 update products set qty=qty+v_rp.qty,updated_at=now() where id=v_rp.product_id;
 update repair_jobs set quote_total=greatest(0,quote_total-v_rp.customer_charge),updated_at=now() where id=v_rp.repair_id;
 insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note) values(v_rp.product_id,'REPAIR_RETURN',v_rp.qty,v_rp.cost_snapshot,'repair',v_rp.repair_id,auth.uid(),p_reason);
 perform public.write_audit('REPAIR_PART_RETURNED','repair_job',v_rp.repair_id,p_reason,jsonb_build_object('repair_part_id',p_repair_part_id));
end $$;

-- Technician -> cashier custody handover.
create or replace function public.request_repair_handover(p_repair_id uuid,p_cashier_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_job repair_jobs%rowtype; v_id uuid;
begin
 select * into v_job from repair_jobs where id=p_repair_id for update; if not found then raise exception 'Repair not found'; end if;
 if public.current_role()='Technician' and v_job.technician_id<>auth.uid() then raise exception 'Repair is not assigned to you'; end if;
 if not exists(select 1 from profiles where id=p_cashier_id and role in('Cashier','Manager','Admin','Developer') and active) then raise exception 'Receiving cashier is unavailable'; end if;
 if v_job.status not in('Repairing','Assigned','Warranty') then raise exception 'Repair is not ready for handover'; end if;
 update repair_jobs set status='Ready for Handover',updated_at=now() where id=p_repair_id;
 insert into repair_handovers(repair_id,from_user,to_user) values(p_repair_id,auth.uid(),p_cashier_id) returning id into v_id;
 insert into repair_status_history(repair_id,status,changed_by,note) values(p_repair_id,'Ready for Handover',auth.uid(),'Technician requested cashier handover');
 insert into notifications(user_id,title,text,kind) values(p_cashier_id,'Repair handover waiting',v_job.job_no||' is ready to receive','handover');
 return v_id;
end $$;
create or replace function public.accept_repair_handover(p_handover_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_h repair_handovers%rowtype;
begin
 select * into v_h from repair_handovers where id=p_handover_id for update; if not found then raise exception 'Handover not found'; end if;
 if v_h.to_user<>auth.uid() and not public.is_management() then raise exception 'This handover is not assigned to you'; end if;
 if v_h.accepted_at is not null then raise exception 'Handover already accepted'; end if;
 update repair_handovers set accepted_at=now() where id=p_handover_id;
 update repair_jobs set status='Completed',completed_at=now(),updated_at=now() where id=v_h.repair_id;
 insert into repair_status_history(repair_id,status,changed_by,note) values(v_h.repair_id,'Completed',auth.uid(),'Cashier accepted physical handover');
 perform public.write_audit('REPAIR_HANDOVER_ACCEPTED','repair_job',v_h.repair_id);
end $$;

-- Collect repair payment; when fully paid, technician earning is posted exactly once.
create or replace function public.collect_repair_payment(p_repair_id uuid,p_amount numeric,p_method text default 'Cash')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job repair_jobs%rowtype; v_parts_cost numeric; v_rate numeric; v_pool numeric; v_earning numeric; v_new_paid numeric;
begin
 if not public.has_role(array['Developer','Admin','Manager','Cashier']) then raise exception 'Not authorized to collect payment'; end if;
 select * into v_job from repair_jobs where id=p_repair_id for update; if not found then raise exception 'Repair not found'; end if;
 if p_amount<=0 or v_job.paid_total+p_amount>v_job.quote_total then raise exception 'Invalid payment amount'; end if;
 insert into repair_payments(repair_id,amount,method,received_by) values(p_repair_id,p_amount,p_method,auth.uid());
 v_new_paid:=v_job.paid_total+p_amount; update repair_jobs set paid_total=v_new_paid,updated_at=now() where id=p_repair_id;
 if v_new_paid>=v_job.quote_total and v_job.technician_id is not null and not v_job.technician_earning_posted then
   select coalesce(sum(cost_snapshot*qty),0) into v_parts_cost from repair_parts where repair_id=p_repair_id and state='Used';
   select coalesce(percentage,50) into v_rate from technician_rates where technician_id=v_job.technician_id;
   v_pool:=greatest(v_job.quote_total-v_parts_cost,0); v_earning:=round(v_pool*v_rate/100,2);
   if v_earning>0 then insert into technician_ledger(technician_id,repair_id,entry_type,amount,description,created_by) values(v_job.technician_id,p_repair_id,'earning',v_earning,'Repair earning - '||v_job.job_no,auth.uid()); end if;
   update repair_jobs set technician_earning_posted=true where id=p_repair_id;
 end if;
 perform public.write_audit('REPAIR_PAYMENT_COLLECTED','repair_job',p_repair_id,null,jsonb_build_object('amount',p_amount,'method',p_method));
 return jsonb_build_object('paid_total',v_new_paid,'balance',greatest(v_job.quote_total-v_new_paid,0));
end $$;

create or replace function public.technician_balance(p_technician_id uuid) returns numeric language sql stable security definer set search_path=public as $$
 select coalesce(sum(balance_effect),0) from technician_ledger where technician_id=p_technician_id;
$$;
create or replace function public.settle_technician(p_technician_id uuid,p_amount numeric default null,p_method text default 'Cash',p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_balance numeric; v_pay numeric; v_settlement uuid;
begin
 if not public.has_role(array['Developer','Admin']) then raise exception 'Only Admin/Developer can settle technicians'; end if;
 perform 1 from profiles where id=p_technician_id and role='Technician' for update; if not found then raise exception 'Technician not found'; end if;
 v_balance:=public.technician_balance(p_technician_id); if v_balance<=0 then raise exception 'Technician has no payable balance'; end if;
 v_pay:=coalesce(p_amount,v_balance); if v_pay<=0 or v_pay>v_balance then raise exception 'Payment cannot exceed payable balance'; end if;
 insert into technician_settlements(technician_id,amount,method,note,paid_by) values(p_technician_id,v_pay,p_method,p_note,auth.uid()) returning id into v_settlement;
 insert into technician_ledger(technician_id,entry_type,amount,description,created_by) values(p_technician_id,'payment',v_pay,coalesce(p_note,'Technician settlement'),auth.uid());
 perform public.write_audit('TECHNICIAN_SETTLED','technician',p_technician_id,p_note,jsonb_build_object('amount',v_pay,'method',p_method));
 return jsonb_build_object('settlement_id',v_settlement,'paid',v_pay,'remaining',v_balance-v_pay);
end $$;
create or replace function public.adjust_technician(p_technician_id uuid,p_kind text,p_amount numeric,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role(array['Developer','Admin']) then raise exception 'Only Admin/Developer can adjust technician ledger'; end if;
 if p_kind not in('bonus','deduction') or p_amount<=0 or nullif(trim(p_reason),'') is null then raise exception 'Valid kind, amount and reason are required'; end if;
 insert into technician_ledger(technician_id,entry_type,amount,description,created_by) values(p_technician_id,p_kind,p_amount,p_reason,auth.uid());
 perform public.write_audit('TECHNICIAN_'||upper(p_kind),'technician',p_technician_id,p_reason,jsonb_build_object('amount',p_amount));
end $$;

-- Feedback token submission: public/anonymous safe RPC.
create or replace function public.submit_feedback(p_token uuid,p_rating int,p_service int default null,p_staff int default null,p_repair int default null,p_comment text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_t feedback_tokens%rowtype; v_id uuid; v_owner uuid;
begin
 select * into v_t from feedback_tokens where token=p_token for update;
 if not found or v_t.used_at is not null or (v_t.expires_at is not null and v_t.expires_at<now()) then raise exception 'Feedback link is invalid or expired'; end if;
 if p_rating not between 1 and 5 then raise exception 'Rating must be 1 to 5'; end if;
 insert into feedback(token_id,rating,service_rating,staff_rating,repair_rating,comment) values(v_t.id,p_rating,p_service,p_staff,p_repair,left(p_comment,2000)) returning id into v_id;
 update feedback_tokens set used_at=now() where id=v_t.id;
 if p_rating<=2 then
   for v_owner in select id from profiles where active and role in('Developer','Admin','Manager') loop
     insert into notifications(user_id,title,text,kind) values(v_owner,'Low customer feedback',p_rating||'-star feedback received','feedback');
   end loop;
 end if;
 return v_id;
end $$;
grant execute on function public.submit_feedback(uuid,int,int,int,int,text) to anon,authenticated;

-- RLS: deny-by-default tables, then grant only required visibility/actions.
do $$ declare t text; begin
 foreach t in array array['profiles','customers','suppliers','products','product_units','inventory_movements','sales','sale_items','sale_payments','repair_jobs','repair_parts','repair_handovers','repair_status_history','repair_payments','repair_photos','technician_rates','technician_ledger','technician_settlements','expenses','notifications','feedback_tokens','feedback','audit_log','app_settings'] loop
   execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;

-- Drop old prototype policies to avoid accidental broad access.
do $$ declare r record; begin
 for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' loop
   execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename);
 end loop;
end $$;

create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_self_update on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and role=public.current_role());
create policy products_read on products for select to authenticated using(active or public.is_management());
create policy units_read on product_units for select to authenticated using(true);
create policy customers_read on customers for select to authenticated using(public.has_role(array['Developer','Admin','Manager','Cashier']));
create policy customers_insert on customers for insert to authenticated with check(public.has_role(array['Developer','Admin','Manager','Cashier']));
create policy suppliers_manage_read on suppliers for select to authenticated using(public.has_role(array['Developer','Admin','Manager']));
create policy inventory_read on inventory_movements for select to authenticated using(public.has_role(array['Developer','Admin','Manager','Cashier','Technician']));
create policy sales_read on sales for select to authenticated using(public.is_management() or cashier_id=auth.uid());
create policy sale_items_read on sale_items for select to authenticated using(exists(select 1 from sales s where s.id=sale_id and (public.is_management() or s.cashier_id=auth.uid())));
create policy sale_payments_read on sale_payments for select to authenticated using(public.is_management() or received_by=auth.uid());
create policy repairs_read on repair_jobs for select to authenticated using(public.is_management() or received_by=auth.uid() or technician_id=auth.uid() or public.current_role()='Cashier');
create policy repair_parts_read on repair_parts for select to authenticated using(exists(select 1 from repair_jobs r where r.id=repair_id and (public.is_management() or r.received_by=auth.uid() or r.technician_id=auth.uid() or public.current_role()='Cashier')));
create policy handovers_read on repair_handovers for select to authenticated using(public.is_management() or from_user=auth.uid() or to_user=auth.uid());
create policy history_read on repair_status_history for select to authenticated using(exists(select 1 from repair_jobs r where r.id=repair_id and (public.is_management() or r.received_by=auth.uid() or r.technician_id=auth.uid() or public.current_role()='Cashier')));
create policy repair_payments_read on repair_payments for select to authenticated using(public.is_management() or received_by=auth.uid());
create policy repair_photos_read on repair_photos for select to authenticated using(exists(select 1 from repair_jobs r where r.id=repair_id and (public.is_management() or r.received_by=auth.uid() or r.technician_id=auth.uid() or public.current_role()='Cashier')));
create policy tech_rates_read on technician_rates for select to authenticated using(public.is_management() or technician_id=auth.uid());
create policy tech_ledger_read on technician_ledger for select to authenticated using(public.is_management() or technician_id=auth.uid());
create policy settlements_read on technician_settlements for select to authenticated using(public.is_management() or technician_id=auth.uid());
create policy expenses_read on expenses for select to authenticated using(public.is_management());
create policy notifications_own on notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_update_own on notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy feedback_read on feedback for select to authenticated using(public.is_management());
create policy audit_read on audit_log for select to authenticated using(public.is_management());
create policy settings_read on app_settings for select to authenticated using(true);

-- Storage bucket for device condition photos.
insert into storage.buckets(id,name,public) values('repair-photos','repair-photos',false) on conflict(id) do nothing;
drop policy if exists repair_photos_storage_read on storage.objects;
drop policy if exists repair_photos_storage_insert on storage.objects;
create policy repair_photos_storage_read on storage.objects for select to authenticated using(bucket_id='repair-photos');
create policy repair_photos_storage_insert on storage.objects for insert to authenticated with check(bucket_id='repair-photos' and public.has_role(array['Developer','Admin','Manager','Cashier','Technician']));

-- RPC permissions: direct financial mutations stay blocked by RLS; RPCs are the write API.
grant execute on function public.receive_purchase(uuid,text,text,text,numeric,numeric,numeric,uuid,text) to authenticated;
grant execute on function public.complete_pos_sale_v2(jsonb,uuid,numeric,text) to authenticated;
grant execute on function public.create_repair_job(text,text,text,text,text,text,text,text,timestamptz,uuid,numeric) to authenticated;
grant execute on function public.change_repair_status(uuid,text,text) to authenticated;
grant execute on function public.use_repair_part(uuid,uuid,numeric,numeric) to authenticated;
grant execute on function public.return_repair_part(uuid,text) to authenticated;
grant execute on function public.request_repair_handover(uuid,uuid) to authenticated;
grant execute on function public.accept_repair_handover(uuid) to authenticated;
grant execute on function public.collect_repair_payment(uuid,numeric,text) to authenticated;
grant execute on function public.technician_balance(uuid) to authenticated;
grant execute on function public.settle_technician(uuid,numeric,text,text) to authenticated;
grant execute on function public.adjust_technician(uuid,text,numeric,text) to authenticated;

create index if not exists idx_repair_technician_status_deadline on repair_jobs(technician_id,status,deadline);
create index if not exists idx_sale_cashier_created on sales(cashier_id,created_at desc);
create index if not exists idx_feedback_token_token on feedback_tokens(token);
create index if not exists idx_repair_payments_repair on repair_payments(repair_id,created_at desc);
