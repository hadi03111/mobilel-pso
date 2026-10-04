import { supabase } from './supabase'
const need=()=>{if(!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')}
const rpc=async(name,args={})=>{need();const{data,error}=await supabase.rpc(name,args);if(error)throw error;return data}
export const backend={
 signIn:async(email,password)=>{need();const{data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return data},
 signOut:async()=>{need();const{error}=await supabase.auth.signOut();if(error)throw error},
 createUser:async payload=>{need();const{data,error}=await supabase.functions.invoke('create-user',{body:payload});if(error)throw error;if(data?.error)throw new Error(data.error);return data},
 receivePurchase:p=>rpc('receive_purchase',{p_product_id:p.productId||null,p_name:p.name,p_category:p.category,p_sku:p.sku||null,p_qty:Number(p.qty),p_unit_cost:Number(p.cost),p_low_stock:Number(p.low||0),p_supplier_id:p.supplierId||null,p_note:p.note||null}),
 createPendingSale:s=>rpc('create_pending_pos_order',{p_items:s.items,p_customer_id:s.customerId||null}),
 completePendingSale:(saleId,paid=null,method='Cash')=>rpc('complete_pending_pos_order',{p_sale_id:saleId,p_paid:paid==null?null:Number(paid),p_payment_method:method}),
 completeSale:s=>rpc('complete_pos_sale_v2',{p_items:s.items,p_customer_id:s.customerId||null,p_paid:s.paid??null,p_payment_method:s.paymentMethod||'Cash'}),
 cancelPendingSale:(saleId,reason)=>rpc('cancel_pending_pos_order',{p_sale_id:saleId,p_reason:reason}),
 reverseSale:(saleId,reason)=>rpc('reverse_paid_sale',{p_sale_id:saleId,p_reason:reason}),
 updateInventoryItem:p=>rpc('update_inventory_item',{p_product_id:p.id,p_name:p.name,p_category:p.category,p_sku:p.sku||'',p_low_stock:Number(p.low||0),p_active:!!p.active}),
 adjustInventory:(id,qty,reason)=>rpc('adjust_inventory_stock',{p_product_id:id,p_qty_change:Number(qty),p_reason:reason}),
 saveSetting:(key,value)=>rpc('save_app_setting',{p_key:key,p_value:value}),
 createRepair:r=>rpc('create_repair_job',{p_customer_name:r.customer,p_customer_phone:r.customerPhone||null,p_brand:r.brand||null,p_model:r.model||r.phone,p_imei:r.imei||null,p_complaint:r.issue,p_condition_notes:r.conditionNotes||null,p_accessories:r.accessories||null,p_deadline:r.deadline||null,p_technician_id:r.technicianId||null,p_estimate:Number(r.total||0)}),
 changeRepairStatus:(repairId,status,note=null)=>rpc('change_repair_status',{p_repair_id:repairId,p_new_status:status,p_note:note}),
 useRepairPart:(repairId,productId,qty,charge)=>rpc('use_repair_part',{p_repair_id:repairId,p_product_id:productId,p_qty:Number(qty),p_customer_charge:Number(charge||0)}),
 returnRepairPart:(repairPartId,reason)=>rpc('return_repair_part',{p_repair_part_id:repairPartId,p_reason:reason}),
 requestHandover:(repairId,cashierId)=>rpc('request_repair_handover',{p_repair_id:repairId,p_cashier_id:cashierId}),
 acceptHandover:handoverId=>rpc('accept_repair_handover',{p_handover_id:handoverId}),
 collectRepairPayment:(repairId,amount,method='Cash')=>rpc('collect_repair_payment',{p_repair_id:repairId,p_amount:Number(amount),p_method:method}),
 settleTechnician:(technicianId,amount=null,method='Cash',note=null)=>rpc('settle_technician',{p_technician_id:technicianId,p_amount:amount==null?null:Number(amount),p_method:method,p_note:note}),
 adjustTechnician:(technicianId,kind,amount,reason)=>rpc('adjust_technician',{p_technician_id:technicianId,p_kind:kind,p_amount:Number(amount),p_reason:reason}),
 submitFeedback:(token,rating,service=null,staff=null,repair=null,comment=null)=>rpc('submit_feedback',{p_token:token,p_rating:rating,p_service:service,p_staff:staff,p_repair:repair,p_comment:comment}),
}
