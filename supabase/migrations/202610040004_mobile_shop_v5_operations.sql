-- Mobile Shop Management System v5 - operational controls
create extension if not exists pgcrypto;

-- Fix auth profile trigger for the actual profiles schema.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,role,active)
 values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(coalesce(new.email,'User'),'@',1)),'Cashier',true)
 on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.purchase_receipts(
 id uuid primary key default gen_random_uuid(), supplier_id uuid references public.suppliers(id),
 reference_no text, total numeric(14,2) not null default 0, note text,
 received_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.purchase_items(
 id uuid primary key default gen_random_uuid(), purchase_id uuid not null references public.purchase_receipts(id) on delete cascade,
 product_id uuid not null references public.products(id), qty numeric(14,3) not null check(qty>0),
 unit_cost numeric(14,2) not null check(unit_cost>=0), created_at timestamptz not null default now()
);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_items enable row level security;
drop policy if exists purchase_receipts_read on public.purchase_receipts;
drop policy if exists purchase_items_read on public.purchase_items;
create policy purchase_receipts_read on public.purchase_receipts for select to authenticated using(public.is_management());
create policy purchase_items_read on public.purchase_items for select to authenticated using(public.is_management());

-- Purchase receipt is atomic and also records history.
create or replace function public.receive_purchase(
 p_product_id uuid, p_name text, p_category text, p_sku text, p_qty numeric, p_unit_cost numeric,
 p_low_stock numeric default 0, p_supplier_id uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_old_qty numeric; v_old_cost numeric; v_new_cost numeric; v_purchase uuid;
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Not authorized to receive purchases'; end if;
 if p_qty<=0 or p_unit_cost<0 then raise exception 'Invalid quantity or cost'; end if;
 if p_product_id is null then
   insert into products(name,category,sku,cost,qty,low_stock,track_imei)
   values(trim(p_name),p_category,nullif(trim(p_sku),''),p_unit_cost,p_qty,coalesce(p_low_stock,0),lower(p_category)='phones') returning id into v_id;
 else
   select qty,cost into v_old_qty,v_old_cost from products where id=p_product_id for update;
   if not found then raise exception 'Product not found'; end if;
   v_new_cost:=((v_old_qty*v_old_cost)+(p_qty*p_unit_cost))/(v_old_qty+p_qty);
   update products set qty=qty+p_qty,cost=round(v_new_cost,2),low_stock=coalesce(p_low_stock,low_stock),active=true,updated_at=now() where id=p_product_id returning id into v_id;
 end if;
 insert into purchase_receipts(supplier_id,total,note,received_by) values(p_supplier_id,p_qty*p_unit_cost,p_note,auth.uid()) returning id into v_purchase;
 insert into purchase_items(purchase_id,product_id,qty,unit_cost) values(v_purchase,v_id,p_qty,p_unit_cost);
 insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,note,created_by)
 values(v_id,'PURCHASE_IN',p_qty,p_unit_cost,'purchase',v_purchase,coalesce(p_note,'Purchase received'),auth.uid());
 perform public.write_audit('PURCHASE_RECEIVED','purchase',v_purchase,p_note,jsonb_build_object('product_id',v_id,'qty',p_qty,'unit_cost',p_unit_cost));
 return v_purchase;
end $$;

-- Inventory management without direct table writes.
create or replace function public.update_inventory_item(p_product_id uuid,p_name text,p_category text,p_sku text,p_low_stock numeric,p_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Not authorized to edit inventory'; end if;
 if p_low_stock<0 then raise exception 'Low stock limit cannot be negative'; end if;
 update products set name=trim(p_name),category=p_category,sku=nullif(trim(p_sku),''),low_stock=p_low_stock,active=p_active,updated_at=now() where id=p_product_id;
 if not found then raise exception 'Product not found'; end if;
 perform public.write_audit('INVENTORY_ITEM_UPDATED','product',p_product_id,null,jsonb_build_object('low_stock',p_low_stock,'active',p_active));
end $$;

create or replace function public.adjust_inventory_stock(p_product_id uuid,p_qty_change numeric,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_p products%rowtype;
begin
 if not public.has_role(array['Developer','Admin']) then raise exception 'Only Admin/Developer can adjust stock'; end if;
 if p_qty_change=0 or nullif(trim(p_reason),'') is null then raise exception 'Quantity change and reason are required'; end if;
 select * into v_p from products where id=p_product_id for update;
 if not found then raise exception 'Product not found'; end if;
 if v_p.qty+p_qty_change<0 then raise exception 'Adjustment would make stock negative'; end if;
 update products set qty=qty+p_qty_change,updated_at=now() where id=p_product_id;
 insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,created_by,note)
 values(p_product_id,'ADJUSTMENT',p_qty_change,v_p.cost,'adjustment',auth.uid(),p_reason);
 perform public.write_audit('INVENTORY_ADJUSTED','product',p_product_id,p_reason,jsonb_build_object('qty_change',p_qty_change));
end $$;

-- Pending POS orders reserve nothing until checkout.
create or replace function public.create_pending_pos_order(p_items jsonb,p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sale uuid:=gen_random_uuid(); v_invoice text; v_item jsonb; v_p products%rowtype; v_qty numeric; v_price numeric; v_total numeric:=0;
begin
 if not public.has_role(array['Developer','Admin','Manager','Cashier']) then raise exception 'Not authorized for POS'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
 v_invoice:='PND-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
 insert into sales(id,invoice_no,customer_id,cashier_id,subtotal,total,paid,status) values(v_sale,v_invoice,p_customer_id,auth.uid(),0,0,0,'Pending');
 for v_item in select * from jsonb_array_elements(p_items) loop
   v_qty:=coalesce((v_item->>'qty')::numeric,1); v_price:=(v_item->>'sale_price')::numeric;
   select * into v_p from products where id=(v_item->>'product_id')::uuid and active=true;
   if not found then raise exception 'Product not found'; end if;
   if v_qty<=0 or v_price<v_p.cost then raise exception 'Invalid quantity or price for %',v_p.name; end if;
   insert into sale_items(sale_id,product_id,product_unit_id,qty,cost_snapshot,sale_price)
   values(v_sale,v_p.id,nullif(v_item->>'product_unit_id','')::uuid,v_qty,v_p.cost,v_price);
   v_total:=v_total+(v_qty*v_price);
 end loop;
 update sales set subtotal=v_total,total=v_total where id=v_sale;
 perform public.write_audit('POS_ORDER_HELD','sale',v_sale,null,jsonb_build_object('invoice_no',v_invoice,'total',v_total));
 return jsonb_build_object('sale_id',v_sale,'invoice_no',v_invoice,'total',v_total);
end $$;

create or replace function public.complete_pending_pos_order(p_sale_id uuid,p_paid numeric default null,p_payment_method text default 'Cash')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_s sales%rowtype; v_i record; v_p products%rowtype; v_paid numeric; v_profit numeric:=0;
begin
 if not public.has_role(array['Developer','Admin','Manager','Cashier']) then raise exception 'Not authorized for POS'; end if;
 select * into v_s from sales where id=p_sale_id for update;
 if not found or v_s.status<>'Pending' then raise exception 'Pending order not found'; end if;
 if not public.is_management() and v_s.cashier_id<>auth.uid() then raise exception 'You can only complete your own pending order'; end if;
 for v_i in select * from sale_items where sale_id=p_sale_id loop
   select * into v_p from products where id=v_i.product_id and active=true for update;
   if v_p.qty<v_i.qty then raise exception 'Insufficient stock for %',v_p.name; end if;
   if v_i.sale_price<v_p.cost then raise exception 'Sale price for % is now below current cost',v_p.name; end if;
   if v_p.track_imei and v_i.product_unit_id is null then raise exception 'IMEI/serial unit required for %',v_p.name; end if;
   if v_i.product_unit_id is not null then
     perform 1 from product_units where id=v_i.product_unit_id and product_id=v_p.id and status='In Stock' for update;
     if not found then raise exception 'Selected IMEI/serial is no longer available'; end if;
     update product_units set status='Sold' where id=v_i.product_unit_id;
   end if;
   update products set qty=qty-v_i.qty,updated_at=now() where id=v_p.id;
   insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note)
   values(v_p.id,'SALE_OUT',-v_i.qty,v_i.cost_snapshot,'sale',p_sale_id,auth.uid(),'POS sale');
   v_profit:=v_profit+(v_i.qty*(v_i.sale_price-v_i.cost_snapshot));
 end loop;
 v_paid:=coalesce(p_paid,v_s.total); if v_paid<0 or v_paid>v_s.total then raise exception 'Invalid payment amount'; end if;
 update sales set paid=v_paid,status=case when v_paid>=total then 'Paid' when v_paid>0 then 'Partially Paid' else 'Unpaid' end where id=p_sale_id;
 if v_paid>0 then insert into sale_payments(sale_id,amount,method,received_by) values(p_sale_id,v_paid,p_payment_method,auth.uid()); end if;
 perform public.write_audit('POS_ORDER_COMPLETED','sale',p_sale_id,null,jsonb_build_object('paid',v_paid,'profit',v_profit));
 return jsonb_build_object('sale_id',p_sale_id,'invoice_no',v_s.invoice_no,'total',v_s.total,'paid',v_paid,'profit',v_profit);
end $$;

create or replace function public.cancel_pending_pos_order(p_sale_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Only Manager/Admin can cancel pending orders'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;
 update sales set status='Cancelled' where id=p_sale_id and status='Pending';
 if not found then raise exception 'Pending order not found'; end if;
 perform public.write_audit('POS_ORDER_CANCELLED','sale',p_sale_id,p_reason);
end $$;

create or replace function public.reverse_paid_sale(p_sale_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_s sales%rowtype; v_i record;
begin
 if not public.has_role(array['Developer','Admin']) then raise exception 'Only Admin/Developer can reverse a paid order'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Reversal reason is required'; end if;
 select * into v_s from sales where id=p_sale_id for update;
 if not found or v_s.status not in('Paid','Partially Paid','Unpaid') or v_s.reversed_at is not null then raise exception 'Sale cannot be reversed'; end if;
 for v_i in select * from sale_items where sale_id=p_sale_id loop
   update products set qty=qty+v_i.qty,updated_at=now() where id=v_i.product_id;
   if v_i.product_unit_id is not null then update product_units set status='In Stock' where id=v_i.product_unit_id; end if;
   insert into inventory_movements(product_id,movement_type,qty,unit_cost,reference_type,reference_id,created_by,note)
   values(v_i.product_id,'REVERSAL_IN',v_i.qty,v_i.cost_snapshot,'sale_reversal',p_sale_id,auth.uid(),p_reason);
 end loop;
 update sales set status='Reversed',reversed_at=now() where id=p_sale_id;
 perform public.write_audit('POS_SALE_REVERSED','sale',p_sale_id,p_reason,jsonb_build_object('original_paid',v_s.paid));
end $$;

-- Persistent application settings.
create or replace function public.save_app_setting(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Not authorized to change settings'; end if;
 insert into app_settings(key,value,updated_by,updated_at) values(p_key,p_value,auth.uid(),now())
 on conflict(key) do update set value=excluded.value,updated_by=auth.uid(),updated_at=now();
 perform public.write_audit('SETTING_UPDATED','setting',null,p_key,p_value);
end $$;

grant execute on function public.update_inventory_item(uuid,text,text,text,numeric,boolean) to authenticated;
grant execute on function public.adjust_inventory_stock(uuid,numeric,text) to authenticated;
grant execute on function public.create_pending_pos_order(jsonb,uuid) to authenticated;
grant execute on function public.complete_pending_pos_order(uuid,numeric,text) to authenticated;
grant execute on function public.cancel_pending_pos_order(uuid,text) to authenticated;
grant execute on function public.reverse_paid_sale(uuid,text) to authenticated;
grant execute on function public.save_app_setting(text,jsonb) to authenticated;
