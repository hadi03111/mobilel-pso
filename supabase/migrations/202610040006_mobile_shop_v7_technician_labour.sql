-- Mobile Shop POS V7: technician labour charge
alter table public.repair_jobs
  add column if not exists labour_charge numeric(14,2) not null default 0;

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
