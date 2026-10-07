begin;
-- Apply after migrations 001–006. Existing financial history is preserved.
create extension if not exists pgcrypto;
alter table products add column if not exists technician_percentage numeric(5,2) check(technician_percentage between 0 and 100);
alter table repair_parts add column if not exists technician_percentage numeric(5,2) check(technician_percentage between 0 and 100);
alter table sale_items add column if not exists returned_qty numeric(14,3) not null default 0 check(returned_qty>=0 and returned_qty<=qty);
create table if not exists sale_returns(id uuid primary key default gen_random_uuid(),sale_id uuid not null references sales(id),return_total numeric(14,2) not null,cash_refund numeric(14,2) not null,reason text not null,created_by uuid not null references profiles(id),created_at timestamptz not null default now());
create table if not exists sale_return_items(id uuid primary key default gen_random_uuid(),return_id uuid not null references sale_returns(id),sale_item_id uuid not null references sale_items(id),qty numeric(14,3) not null check(qty>0),unit_price numeric(14,2) not null);
alter table sale_returns enable row level security;
alter table sale_return_items enable row level security;
create policy returns_read on sale_returns for select to authenticated using(has_role(array['Admin','Manager']));
create policy return_items_read on sale_return_items for select to authenticated using(has_role(array['Admin','Manager']));
-- Completed orders are restricted in the database as well as the interface.
drop policy if exists sales_read on sales;
create policy sales_read on sales for select to authenticated using(has_role(array['Admin','Manager']) or (status='Pending' and (cashier_id=auth.uid() or public.current_role()='Developer')));
drop policy if exists sale_items_read on sale_items;
create policy sale_items_read on sale_items for select to authenticated using(exists(select 1 from sales s where s.id=sale_id));
drop policy if exists sale_payments_read on sale_payments;
create policy sale_payments_read on sale_payments for select to authenticated using(has_role(array['Admin','Manager']));

create or replace function edit_pending_pos_order(p_sale_id uuid,p_items jsonb,p_approval_email text default '',p_approval_password text default '') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare s sales%rowtype; item jsonb; p products%rowtype; amount numeric:=0; q numeric; price numeric; approver uuid; reduced boolean;
begin
 if not has_role(array['Admin','Manager','Cashier','Developer']) then raise exception 'Not authorized';end if;
 select * into s from sales where id=p_sale_id for update;
 if not found or s.status<>'Pending' then raise exception 'Order is no longer pending';end if;
 if not is_management() and s.cashier_id<>auth.uid() then raise exception 'You may edit only your own pending orders';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Order must contain at least one item';end if;
 select exists(select 1 from (select product_id,sale_price,sum(qty) qty from sale_items where sale_id=p_sale_id group by product_id,sale_price) old
 where old.qty>coalesce((select sum((x->>'qty')::numeric) from jsonb_array_elements(p_items) x where (x->>'product_id')::uuid=old.product_id and (x->>'sale_price')::numeric=old.sale_price),0)) into reduced;
 if reduced then
   select u.id into approver from auth.users u join profiles pr on pr.id=u.id
   where lower(u.email)=lower(trim(p_approval_email)) and pr.active and pr.role in('Admin','Manager')
   and coalesce(p_approval_password,'')<>'' and u.encrypted_password=crypt(p_approval_password,u.encrypted_password);
   if approver is null then raise exception 'Valid Admin or Manager email and password are required';end if;
 end if;
 -- Validate complete aggregate quantities before replacing any line.
 for item in select jsonb_build_object('product_id',x->>'product_id','qty',sum((x->>'qty')::numeric)) from jsonb_array_elements(p_items) x group by x->>'product_id' order by x->>'product_id' loop
   select * into p from products where id=(item->>'product_id')::uuid and active for update;
   if not found or (item->>'qty')::numeric>p.qty then raise exception 'Insufficient stock or unavailable item';end if;
 end loop;
 delete from sale_items where sale_id=p_sale_id;
 for item in select * from jsonb_array_elements(p_items) loop
   select * into p from products where id=(item->>'product_id')::uuid;
   q:=(item->>'qty')::numeric;price:=(item->>'sale_price')::numeric;
   if q is null or q<=0 or price is null or price<p.cost then raise exception 'Invalid quantity or price';end if;
   insert into sale_items(sale_id,product_id,product_unit_id,qty,cost_snapshot,sale_price) values(p_sale_id,p.id,nullif(item->>'product_unit_id','')::uuid,q,p.cost,price);
   amount:=amount+q*price;
 end loop;
 update sales set subtotal=amount,total=amount where id=p_sale_id;
 perform write_audit('POS_ORDER_EDITED','sale',p_sale_id,null,jsonb_build_object('approval_by',approver,'old_total',s.total,'new_total',amount));
 return jsonb_build_object('sale_id',p_sale_id,'total',amount);
end $$;

create or replace function return_pos_items(p_sale_id uuid,p_items jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s sales%rowtype;i sale_items%rowtype;x jsonb;q numeric;amount numeric:=0;refund numeric;rid uuid:=gen_random_uuid();
begin
 if not has_role(array['Admin','Manager']) then raise exception 'Only Admin or Manager may process returns';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Return reason is required';end if;
 select * into s from sales where id=p_sale_id for update;
 if not found or s.status not in('Paid','Partially Paid','Unpaid') or s.reversed_at is not null then raise exception 'Order cannot be returned';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Choose items to return';end if;
 if exists(select 1 from jsonb_array_elements(p_items) e group by e.value->>'sale_item_id' having count(*)>1) then raise exception 'Duplicate return line';end if;
 for x in select * from jsonb_array_elements(p_items) loop
   select * into i from sale_items where id=(x->>'sale_item_id')::uuid and sale_id=p_sale_id for update;
   if not found then raise exception 'Item does not belong to this order';end if;
   q:=(x->>'qty')::numeric;
   if q is null or q<=0 or q>i.qty-i.returned_qty then raise exception 'Quantity exceeds the remaining sold quantity';end if;
   if i.product_unit_id is not null and (q<>1 or i.qty<>1) then raise exception 'Serialized items must be returned as one complete unit';end if;
   amount:=amount+q*i.sale_price;
 end loop;
 refund:=greatest(0,s.paid-greatest(0,s.total-amount));
 insert into sale_returns(id,sale_id,return_total,cash_refund,reason,created_by) values(rid,p_sale_id,amount,refund,p_reason,auth.uid());
 for x in select * from jsonb_array_elements(p_items) order by (value->>'sale_item_id') loop
   select * into i from sale_items where id=(x->>'sale_item_id')::uuid;q:=(x->>'qty')::numeric;
   update sale_items set returned_qty=returned_qty+q where id=i.id;
   update products set qty=qty+q,updated_at=now() where id=i.product_id;
   if i.product_unit_id is not null then update product_units set status='In Stock' where id=i.product_unit_id;end if;
   insert into sale_return_items(return_id,sale_item_id,qty,unit_price) values(rid,i.id,q,i.sale_price);
   insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note) values(i.product_id,'SALE_RETURN',q,i.cost_snapshot,'sale_return',rid,auth.uid(),p_reason);
 end loop;
 update sales set total=greatest(0,total-amount),subtotal=greatest(0,subtotal-amount),paid=paid-refund where id=p_sale_id;
 update sales set status=case when total=0 then 'Returned' when paid>=total then 'Paid' when paid>0 then 'Partially Paid' else 'Unpaid' end where id=p_sale_id;
 perform write_audit('POS_RETURN','sale',p_sale_id,p_reason,jsonb_build_object('return_id',rid,'amount',amount,'cash_refund',refund));
 return jsonb_build_object('return_id',rid,'return_total',amount,'cash_refund',refund);
end $$;
-- Reversal returns only quantity which has not already been returned.
create or replace function reverse_paid_sale(p_sale_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare s sales%rowtype;i record;
begin
 if not has_role(array['Admin','Developer']) then raise exception 'Only Admin/Developer may reverse';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Reason required';end if;
 select * into s from sales where id=p_sale_id for update;
 if not found or s.status not in('Paid','Partially Paid','Unpaid') or s.reversed_at is not null then raise exception 'Order cannot be reversed';end if;
 for i in select * from sale_items where sale_id=p_sale_id and qty>returned_qty order by product_id loop
   update products set qty=qty+(i.qty-i.returned_qty),updated_at=now() where id=i.product_id;
   if i.product_unit_id is not null then update product_units set status='In Stock' where id=i.product_unit_id;end if;
   insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note) values(i.product_id,'REVERSAL_IN',i.qty-i.returned_qty,i.cost_snapshot,'sale_reversal',p_sale_id,auth.uid(),p_reason);
 end loop;
 update sales set status='Reversed',reversed_at=now() where id=p_sale_id;
 perform write_audit('POS_SALE_REVERSED','sale',p_sale_id,p_reason,jsonb_build_object('original_paid',s.paid));
end $$;

create or replace function save_technician_rate(p_technician_id uuid,p_percentage numeric) returns void language plpgsql security definer set search_path=public as $$
begin
 if not has_role(array['Admin','Developer']) then raise exception 'Only Admin can change technician rates';end if;
 if p_percentage is null or p_percentage<0 or p_percentage>100 then raise exception 'Percentage must be 0–100';end if;
 if not exists(select 1 from profiles where id=p_technician_id and role='Technician') then raise exception 'Technician not found';end if;
 insert into technician_rates(technician_id,percentage) values(p_technician_id,p_percentage) on conflict(technician_id) do update set percentage=excluded.percentage,updated_at=now();
 perform write_audit('TECHNICIAN_RATE_CHANGED','profile',p_technician_id,null,jsonb_build_object('percentage',p_percentage));
end $$;
create or replace function save_part_rate(p_product_id uuid,p_percentage numeric) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_management() then raise exception 'Not authorized';end if;
 if p_percentage<0 or p_percentage>100 then raise exception 'Percentage must be 0–100';end if;
 update products set technician_percentage=p_percentage where id=p_product_id;
 if not found then raise exception 'Product not found';end if;
 perform write_audit('PART_RATE_CHANGED','product',p_product_id,null,jsonb_build_object('percentage',p_percentage));
end $$;
create or replace function receive_purchase_v8(p_product_id uuid,p_name text,p_category text,p_sku text,p_qty numeric,p_unit_cost numeric,p_low_stock numeric default 0,p_supplier_id uuid default null,p_note text default null,p_percentage numeric default null) returns uuid language plpgsql security definer set search_path=public as $$
declare receipt uuid;product uuid;
begin
 if nullif(trim(p_category),'') is null then raise exception 'Category is required';end if;
 receipt:=receive_purchase(p_product_id,p_name,trim(p_category),p_sku,p_qty,p_unit_cost,p_low_stock,p_supplier_id,p_note);
 select product_id into product from purchase_items where purchase_id=receipt limit 1;
 if p_product_id is null or p_percentage is not null then perform save_part_rate(product,p_percentage);end if;
 return receipt;
end $$;

-- Charges are unit prices. Snapshot the rate when a part is attached.
create or replace function use_repair_part(p_repair_id uuid,p_product_id uuid,p_qty numeric,p_customer_charge numeric default null) returns uuid language plpgsql security definer set search_path=public as $$
declare p products%rowtype;j repair_jobs%rowtype;rid uuid;charge numeric;
begin
 if not has_role(array['Admin','Manager','Developer','Cashier','Technician']) then raise exception 'Not authorized';end if;
 select * into j from repair_jobs where id=p_repair_id for update;
 if not found then raise exception 'Repair not found';end if;
 if public.current_role()='Technician' and j.technician_id is distinct from auth.uid() then raise exception 'Repair is not assigned to you';end if;
 if j.status not in('Received','Assigned','Repairing','Warranty') or j.paid_total>0 or j.technician_earning_posted then raise exception 'Parts cannot be changed at this stage';end if;
 select * into p from products where id=p_product_id and active for update;
 if not found or p_qty is null or p_qty<=0 or p.qty<p_qty then raise exception 'Part unavailable or insufficient stock';end if;
 charge:=coalesce(p_customer_charge,p.cost);
 if charge<p.cost then raise exception 'Part selling price cannot be below cost';end if;
 insert into repair_parts(repair_id,product_id,qty,cost_snapshot,customer_charge,technician_percentage,state) values(p_repair_id,p.id,p_qty,p.cost,round(charge*p_qty,2),p.technician_percentage,'Used') returning id into rid;
 update products set qty=qty-p_qty,updated_at=now() where id=p.id;
 update repair_jobs set quote_total=quote_total+round(charge*p_qty,2),updated_at=now() where id=p_repair_id;
 insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note) values(p.id,'REPAIR_USE',-p_qty,p.cost,'repair',p_repair_id,auth.uid(),'Part attached');
 perform write_audit('REPAIR_PART_USED','repair_job',p_repair_id,null,jsonb_build_object('part',rid,'qty',p_qty,'unit_price',charge));return rid;
end $$;
create or replace function create_repair_with_parts(p_customer_name text,p_customer_phone text,p_brand text,p_model text,p_imei text,p_complaint text,p_condition_notes text,p_accessories text,p_deadline timestamptz,p_technician_id uuid default null,p_estimate numeric default 0,p_parts jsonb default '[]') returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;part jsonb;
begin
 if p_parts is null or jsonb_typeof(p_parts)<>'array' then raise exception 'Invalid parts';end if;
 result:=create_repair_job(p_customer_name,p_customer_phone,p_brand,p_model,p_imei,p_complaint,p_condition_notes,p_accessories,p_deadline,p_technician_id,p_estimate);
 for part in select * from jsonb_array_elements(p_parts) loop
 perform use_repair_part((result->>'repair_id')::uuid,(part->>'product_id')::uuid,(part->>'qty')::numeric,(part->>'customer_charge')::numeric);
 end loop;
 return result;
end $$;
create or replace function edit_repair_details(p_repair_id uuid,p_patch jsonb) returns void language plpgsql security definer set search_path=public as $$
declare j repair_jobs%rowtype;tech uuid;customer uuid;
begin
 if not has_role(array['Admin','Manager','Developer','Cashier']) then raise exception 'Not authorized';end if;
 select * into j from repair_jobs where id=p_repair_id for update;if not found then raise exception 'Repair not found';end if;
 if nullif(trim(p_patch->>'customer'),'') is null or nullif(trim(p_patch->>'model'),'') is null or nullif(trim(p_patch->>'issue'),'') is null then raise exception 'Customer, model and complaint are required';end if;
 tech:=nullif(p_patch->>'technicianId','')::uuid;
 if tech is distinct from j.technician_id and (j.status not in('Received','Assigned','Repairing','Warranty') or j.paid_total>0 or j.technician_earning_posted) then raise exception 'Technician cannot be reassigned after handover or payment';end if;
 if tech is not null and not exists(select 1 from profiles where id=tech and active and role='Technician') then raise exception 'Technician unavailable';end if;
 -- Create a repair-specific customer record if corrections are needed; do not change other jobs.
 select id into customer from customers where id=j.customer_id and name=trim(p_patch->>'customer') and phone is not distinct from nullif(trim(p_patch->>'customerPhone'),'');
 if customer is null then
   select id into customer from customers where name=trim(p_patch->>'customer') and phone is not distinct from nullif(trim(p_patch->>'customerPhone'),'') limit 1;
   if customer is null then insert into customers(name,phone) values(trim(p_patch->>'customer'),nullif(trim(p_patch->>'customerPhone'),'')) returning id into customer;end if;
 end if;
 update repair_jobs set customer_id=customer,brand=p_patch->>'brand',model=trim(p_patch->>'model'),imei=p_patch->>'imei',complaint=trim(p_patch->>'issue'),condition_notes=p_patch->>'conditionNotes',accessories=p_patch->>'accessories',deadline=(p_patch->>'deadline')::timestamptz,technician_id=tech,status=case when status='Received' and tech is not null then 'Assigned' when status='Assigned' and tech is null then 'Received' else status end,updated_at=now() where id=p_repair_id;
 perform write_audit('REPAIR_DETAILS_EDITED','repair_job',p_repair_id,null,jsonb_build_object('old_technician',j.technician_id,'new_technician',tech));
end $$;

-- Each part's profit uses its own percentage or the technician default.
-- Separate labour/other service charges use the technician default.
create or replace function collect_repair_payment(p_repair_id uuid,p_amount numeric,p_method text default 'Cash') returns jsonb language plpgsql security definer set search_path=public as $$
declare j repair_jobs%rowtype;rate numeric;part_charge numeric;parts_earning numeric;earning numeric;new_paid numeric;
begin
 if not has_role(array['Admin','Manager','Developer','Cashier']) then raise exception 'Not authorized';end if;
 select * into j from repair_jobs where id=p_repair_id for update;if not found then raise exception 'Repair not found';end if;
 if j.status not in('Completed','Delivered','Ready for Handover') then raise exception 'Repair must finish before payment';end if;
 if p_amount is null or p_amount<=0 or j.paid_total+p_amount>j.quote_total then raise exception 'Invalid payment amount';end if;
 insert into repair_payments(repair_id,amount,method,received_by) values(p_repair_id,p_amount,p_method,auth.uid());
 new_paid:=j.paid_total+p_amount;update repair_jobs set paid_total=new_paid,updated_at=now() where id=p_repair_id;
 if new_paid>=j.quote_total and j.technician_id is not null and not j.technician_earning_posted then
   select coalesce((select percentage from technician_rates where technician_id=j.technician_id),50) into rate;
   select coalesce(sum(customer_charge),0),coalesce(sum(greatest(customer_charge-cost_snapshot*qty,0)*coalesce(technician_percentage,rate)/100),0) into part_charge,parts_earning from repair_parts where repair_id=p_repair_id and state='Used';
   earning:=round(parts_earning+greatest(j.quote_total-part_charge,0)*rate/100,2);
   if earning>0 then insert into technician_ledger(technician_id,repair_id,entry_type,amount,description,created_by) values(j.technician_id,p_repair_id,'earning',earning,'Part profit + service share - '||j.job_no,auth.uid());end if;
   update repair_jobs set technician_earning_posted=true where id=p_repair_id;
 end if;
 perform write_audit('REPAIR_PAYMENT_COLLECTED','repair_job',p_repair_id,null,jsonb_build_object('amount',p_amount,'technician_earning',earning));
 return jsonb_build_object('paid_total',new_paid,'balance',j.quote_total-new_paid,'earning',earning);
end $$;
-- Fix V7 schema mismatch (audit_log uses metadata, never details).
create or replace function public.set_repair_labour_charge(
  p_repair_id uuid,
  p_labour_charge numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_job public.repair_jobs%rowtype;
  v_new numeric(14,2) := greatest(coalesce(p_labour_charge,0),0);
  v_total numeric(14,2);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.profiles where id=v_uid and active=true;
  if v_role not in ('Developer','Admin','Manager','Technician') then
    raise exception 'Not allowed to set repair labour charge';
  end if;

  select * into v_job from public.repair_jobs where id=p_repair_id for update;
  if not found then raise exception 'Repair not found'; end if;
  if v_role='Technician' and v_job.technician_id is distinct from v_uid then
    raise exception 'Technicians can only update their assigned repairs';
  end if;
  if v_job.status not in ('Assigned','Repairing','Warranty') then
    raise exception 'Labour charge can only be changed while the repair is in workshop';
  end if;
  if coalesce(v_job.paid_total,0)>0 then
    raise exception 'Labour charge cannot be changed after payment has started';
  end if;

  v_total := greatest(0, coalesce(v_job.quote_total,0) - coalesce(v_job.labour_charge,0) + v_new);
  update public.repair_jobs
     set labour_charge=v_new, quote_total=v_total, updated_at=now()
   where id=p_repair_id;

  insert into public.audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(v_uid,'SET_REPAIR_LABOUR_CHARGE','repair_job',p_repair_id,
    jsonb_build_object('old_labour_charge',coalesce(v_job.labour_charge,0),'new_labour_charge',v_new,'quote_total',v_total));

  return jsonb_build_object('labour_charge',v_new,'quote_total',v_total);
end;
$$;

grant execute on function public.set_repair_labour_charge(uuid,numeric) to authenticated;

create or replace function return_repair_part(p_repair_part_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare rp repair_parts%rowtype;j repair_jobs%rowtype;
begin
 if not has_role(array['Admin','Manager','Developer','Cashier','Technician']) then raise exception 'Not authorized';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Reason required';end if;
 -- Same locking order as attaching parts and payment.
 select * into rp from repair_parts where id=p_repair_part_id;
 if not found then raise exception 'Part not found';end if;
 select * into j from repair_jobs where id=rp.repair_id for update;
 select * into rp from repair_parts where id=p_repair_part_id for update;
 if public.current_role()='Technician' and j.technician_id is distinct from auth.uid() then raise exception 'Repair is not assigned to you';end if;
 if j.status not in('Received','Assigned','Repairing','Warranty') or j.paid_total>0 or j.technician_earning_posted then raise exception 'Parts cannot change after handover or payment';end if;
 if rp.state<>'Used' then raise exception 'Part already returned';end if;
 update repair_parts set state='Returned' where id=rp.id;
 update products set qty=qty+rp.qty,updated_at=now() where id=rp.product_id;
 update repair_jobs set quote_total=greatest(0,quote_total-rp.customer_charge),updated_at=now() where id=j.id;
 insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note) values(rp.product_id,'REPAIR_RETURN',rp.qty,rp.cost_snapshot,'repair',j.id,auth.uid(),p_reason);
 perform write_audit('REPAIR_PART_RETURNED','repair_job',j.id,p_reason,jsonb_build_object('repair_part',rp.id));
end $$;
-- New RPCs must not be callable by anonymous clients.
revoke all on function edit_pending_pos_order(uuid,jsonb,text,text),return_pos_items(uuid,jsonb,text),save_technician_rate(uuid,numeric),save_part_rate(uuid,numeric),receive_purchase_v8(uuid,text,text,text,numeric,numeric,numeric,uuid,text,numeric),create_repair_with_parts(text,text,text,text,text,text,text,text,timestamptz,uuid,numeric,jsonb),edit_repair_details(uuid,jsonb) from public;
grant execute on function edit_pending_pos_order(uuid,jsonb,text,text),return_pos_items(uuid,jsonb,text),save_technician_rate(uuid,numeric),save_part_rate(uuid,numeric),receive_purchase_v8(uuid,text,text,text,numeric,numeric,numeric,uuid,text,numeric),create_repair_with_parts(text,text,text,text,text,text,text,text,timestamptz,uuid,numeric,jsonb),edit_repair_details(uuid,jsonb) to authenticated;
grant select on sale_returns,sale_return_items to authenticated;
commit;
