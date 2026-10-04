-- V6 client-handover hardening: secure supplier creation for management.
create or replace function public.create_supplier(p_name text,p_phone text default null,p_address text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Not authorized to create suppliers'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Supplier name is required'; end if;
  insert into public.suppliers(name,phone,address) values(trim(p_name),nullif(trim(p_phone),''),nullif(trim(p_address),'')) returning id into v_id;
  perform public.write_audit('supplier.created','supplier',v_id,jsonb_build_object('name',trim(p_name)));
  return v_id;
end;$$;
grant execute on function public.create_supplier(text,text,text) to authenticated;
