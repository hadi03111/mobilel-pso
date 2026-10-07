begin;
-- Partial settlements retain the unpaid balance. Admin and Manager can pay.
create or replace function public.settle_technician(p_technician_id uuid,p_amount numeric default null,p_method text default 'Cash',p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_balance numeric;v_pay numeric;v_settlement uuid;
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Only Admin or Manager can settle technicians';end if;
 perform 1 from profiles where id=p_technician_id and role='Technician' for update;
 if not found then raise exception 'Technician not found';end if;
 v_balance:=public.technician_balance(p_technician_id);
 if v_balance<=0 then raise exception 'Technician has no payable balance';end if;
 v_pay:=round(coalesce(p_amount,v_balance),2);
 if v_pay::text in('NaN','Infinity','-Infinity') or v_pay<=0 or v_pay>v_balance then raise exception 'Payment cannot exceed payable balance';end if;
 if nullif(trim(p_method),'') is null then raise exception 'Payment method required';end if;
 insert into technician_settlements(technician_id,amount,method,note,paid_by) values(p_technician_id,v_pay,p_method,p_note,auth.uid()) returning id into v_settlement;
 insert into technician_ledger(technician_id,entry_type,amount,description,created_by) values(p_technician_id,'payment',v_pay,coalesce(nullif(trim(p_note),''),'Technician settlement')||' · '||p_method,auth.uid());
 perform public.write_audit('TECHNICIAN_SETTLED','technician',p_technician_id,p_note,jsonb_build_object('settlement_id',v_settlement,'amount',v_pay,'method',p_method,'balance_before',v_balance,'balance_after',v_balance-v_pay));
 return jsonb_build_object('settlement_id',v_settlement,'paid',v_pay,'remaining',v_balance-v_pay);
end $$;

-- Manual account earnings and deductions append entries, preserving history.
create or replace function public.adjust_technician(p_technician_id uuid,p_kind text,p_amount numeric,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Only Admin or Manager can adjust earnings';end if;
 if p_kind is null or p_kind not in('bonus','deduction') or p_amount is null or p_amount::text in('NaN','Infinity','-Infinity') or round(p_amount,2)<=0 or nullif(trim(p_reason),'') is null then raise exception 'Valid kind, amount and reason are required';end if;
 perform 1 from profiles where id=p_technician_id and role='Technician' for update;
 if not found then raise exception 'Technician not found';end if;
 insert into technician_ledger(technician_id,entry_type,amount,description,created_by) values(p_technician_id,p_kind,round(p_amount,2),trim(p_reason),auth.uid());
 perform public.write_audit('TECHNICIAN_'||upper(p_kind),'technician',p_technician_id,p_reason,jsonb_build_object('amount',round(p_amount,2)));
end $$;

-- Set a repair's final technician earning (e.g. 500 → 600 or 400).
-- Do not overwrite automatic earnings or customer charges; post the difference.
create or replace function public.set_repair_technician_earning(p_repair_id uuid,p_amount numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j repair_jobs%rowtype;tech uuid;old_amount numeric;new_amount numeric;difference numeric;
begin
 if not public.has_role(array['Developer','Admin','Manager']) then raise exception 'Only Admin or Manager can adjust repair earnings';end if;
 if p_amount is null or p_amount::text in('NaN','Infinity','-Infinity') or p_amount<0 or nullif(trim(p_reason),'') is null then raise exception 'Nonnegative final earning and a reason are required';end if;
 select technician_id into tech from repair_jobs where id=p_repair_id;
 if tech is null then raise exception 'Assigned technician required';end if;
 -- Shared profile lock serializes settlements, manual bonuses and corrections.
 perform 1 from profiles where id=tech and role='Technician' for update;
 select * into j from repair_jobs where id=p_repair_id for update;
 if not found or j.technician_id is distinct from tech then raise exception 'Repair assignment changed; reload and try again';end if;
 if not j.technician_earning_posted then raise exception 'Repair earnings can be adjusted after the original earning is posted on full payment';end if;
 select coalesce(sum(balance_effect),0) into old_amount from technician_ledger where technician_id=tech and repair_id=p_repair_id and entry_type<>'payment';
 new_amount:=round(p_amount,2);difference:=new_amount-old_amount;
 if difference<>0 then
   insert into technician_ledger(technician_id,repair_id,entry_type,amount,description,created_by)
   values(tech,p_repair_id,case when difference>0 then 'bonus' else 'deduction' end,abs(difference),'Repair earning adjustment · '||j.job_no||' · '||trim(p_reason),auth.uid());
   perform public.write_audit('REPAIR_TECHNICIAN_EARNING_ADJUSTED','repair_job',p_repair_id,p_reason,jsonb_build_object('technician_id',tech,'old_earning',old_amount,'new_earning',new_amount,'difference',difference));
 end if;
 return jsonb_build_object('old_earning',old_amount,'new_earning',new_amount,'balance',public.technician_balance(tech));
end $$;
revoke all on function public.settle_technician(uuid,numeric,text,text),public.adjust_technician(uuid,text,numeric,text),public.set_repair_technician_earning(uuid,numeric,text) from public;
grant execute on function public.settle_technician(uuid,numeric,text,text),public.adjust_technician(uuid,text,numeric,text),public.set_repair_technician_earning(uuid,numeric,text) to authenticated;
commit;
