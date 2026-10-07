import{backend}from'../lib/backend';import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Plus,
  Clock3,
  Handshake,
  CheckCircle2,
  Printer,
  ArrowRight,
} from 'lucide-react'

import { useApp } from '../context/AppContext'
import {
  Badge,
  Card,
  PageHead,
  SearchBox,
  money,
} from '../components/UI'

/* =========================================================
   REPAIR LIST CONFIGURATION
========================================================= */

const cfg = {
  active: [
    'Active Repairs',
    'All phones currently moving through the workshop.',
    (r) => !['Completed', 'Delivered'].includes(r.status),
  ],

  handover: [
    'Ready for Handover',
    'Completed by technicians and waiting for cashier custody.',
    (r) => r.status === 'Ready for Handover',
  ],

  completed: [
    'Completed Repairs',
    'Finished repair jobs and customer billing.',
    (r) => r.status === 'Completed',
  ],

  warranty: [
    'Warranty / Rework',
    'Linked warranty returns and workmanship follow-up.',
    (r) => r.status === 'Warranty',
  ],

  history: [
    'Repair History',
    'Complete searchable repair record.',
    () => true,
  ],
}

/* =========================================================
   REPAIR CENTER
========================================================= */

export function Repairs() {
  const { repairs } = useApp()

  const activeCount = repairs.filter(
    (r) => !['Completed', 'Delivered'].includes(r.status)
  ).length

  const handoverCount = repairs.filter(
    (r) => r.status === 'Ready for Handover'
  ).length

  const completedCount = repairs.filter(
    (r) => r.status === 'Completed'
  ).length

  const kpis = [
    {
      id: 'active',
      label: 'Active',
      value: activeCount,
      icon: Clock3,
    },
    {
      id: 'handover',
      label: 'Ready Handover',
      value: handoverCount,
      icon: Handshake,
    },
    {
      id: 'completed',
      label: 'Completed',
      value: completedCount,
      icon: CheckCircle2,
    },
  ]

  return (
    <>
      <PageHead
        title="Repair Center"
        subtitle="Control every customer device from reception to delivery."
        actions={
          <Link
            className="btn primary"
            to="/repairs/new"
          >
            <Plus size={17} />
            New Repair
          </Link>
        }
      />

      <div className="repair-kpis">
        {kpis.map((item) => {
          const Icon = item.icon

          return (
            <Card key={item.id}>
              <Icon />

              <b>{item.value}</b>

              <span>{item.label}</span>
            </Card>
          )
        })}
      </div>

      <RepairTable rows={repairs} />
    </>
  )
}

/* =========================================================
   FILTERED REPAIR LISTS
========================================================= */

export function RepairList({ mode }) {
  const { repairs } = useApp()

  const [q, setQ] = useState('')

  const selectedConfig = cfg[mode] || cfg.history

  const [cTitle, sub, filterFn] = selectedConfig

  const search = q.trim().toLowerCase()

  const rows = repairs
    .filter(filterFn)
    .filter((r) => {
      if (!search) return true

      const searchableText = [
        r.id,
        r.customer,
        r.customerPhone,
        r.phone,
        r.imei,
        r.issue,
        r.tech,
        r.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(search)
    })

  return (
    <>
      <PageHead
        title={cTitle}
        subtitle={sub}
        actions={
          <Link
            className="btn primary"
            to="/repairs/new"
          >
            <Plus size={17} />
            New Repair
          </Link>
        }
      />

      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search job, customer, phone or IMEI..."
        />
      </div>

      <RepairTable rows={rows} />
    </>
  )
}

/* =========================================================
   REPAIR TABLE
========================================================= */

function RepairTable({ rows = [] }) {
  const {profile}=useApp()
  return (
    <Card className="table-card">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Customer / Device</th>
            <th>Technician</th>
            <th>Deadline</th>
            <th>Status</th>
            <th>Bill</th>
            <th />
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.id}</b>

                <small>
                  {r.created || '—'}
                </small>
              </td>

              <td>
                <b>{r.phone || 'Unknown device'}</b>

                <small>
                  {r.customer || 'Unknown customer'}
                  {r.issue ? ` · ${r.issue}` : ''}
                </small>
              </td>

              <td>
                {r.tech || 'Unassigned'}
              </td>

              <td>
                <span
                  className={`deadline ${
                    r.urgency || 'ok'
                  }`}
                >
                  {r.deadline || 'No deadline'}
                </span>
              </td>

              <td>
                <Badge>
                  {r.status || 'Received'}
                </Badge>
              </td>

              <td>
                <strong>
                  {money(Number(r.total || 0))}
                </strong>

                <small>
                  {Number(r.paid || 0) > 0
                    ? `${money(
                        Number(r.paid || 0)
                      )} paid`
                    : 'Unpaid'}
                </small>
              </td>

              <td>
                {['Admin','Manager','Developer','Cashier'].includes(profile?.role)&&<Link className="btn ghost sm" to={`/repairs/${r.id}`}>Edit</Link>}
                <Link
                  className="iconbtn"
                  to={`/repairs/${r.id}`}
                  aria-label={`Open repair ${r.id}`}
                >
                  <ArrowRight size={18} />
                </Link>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan="7">
                <div className="empty-inline">
                  No repair jobs found.
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

/* =========================================================
   NEW REPAIR
========================================================= */

export function NewRepair() {
  const {
    addRepair,
    techs,products,
  } = useApp()

  const [parts,setParts]=useState([])
  const [done, setDone] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (saving) return

    const form = e.currentTarget
    const f = new FormData(form)

    const data = Object.fromEntries(f)

    const technician = techs.find(
      (t) => t.id === data.tech
    )

    data.technicianId =
      technician?.id || null

    data.total = Number(data.total || 0)
    data.parts = parts.map(p=>({product_id:p.productId,qty:Number(p.qty),customer_charge:p.price===''?null:Number(p.price)}))

    /*
     * No Waiting Approval stage.
     *
     * If technician is selected at reception,
     * backend/application can start the job
     * as Assigned.
     *
     * Otherwise it remains Received.
     */
    data.status = technician
      ? 'Assigned'
      : 'Received'

    try {
      setSaving(true)

      const id = await addRepair(data)

      setDone(id)
      setParts([])

      form.reset()
    } catch (error) {
      console.error(
        'Failed to create repair:',
        error
      )

      alert(
        error?.message ||
          'Unable to create repair job.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHead
        title="Receive New Repair"
        subtitle="Create custody record, deadline and technician assignment before the device enters workshop."
      />

      {done && (
        <div className="success-banner">
          <CheckCircle2 />

          <div>
            <b>{done} created successfully.</b>

            <span>
              Print the customer receipt and phone
              tag now.
            </span>
          </div>
        </div>
      )}

      <form
        className="repair-form"
        onSubmit={handleSubmit}
      >
        {/* CUSTOMER */}

        <Card>
          <h3>Customer</h3>

          <div className="formgrid">
            <label>
              Customer name

              <input
                name="customer"
                required
                placeholder="Full name"
              />
            </label>

            <label>
              Mobile number

              <input
                name="customerPhone"
                required
                placeholder="03xx xxxxxxx"
              />
            </label>
          </div>
        </Card>

        {/* DEVICE */}

        <Card>
          <h3>Device & Condition</h3>

          <div className="formgrid">
            <label>
              Brand / Model

              <input
                name="phone"
                required
                placeholder="e.g. Samsung A52"
              />
            </label>

            <label>
              IMEI / Serial

              <input
                name="imei"
                placeholder="Scan or enter IMEI"
              />
            </label>

            <label>
              Problem / Complaint

              <input
                name="issue"
                required
                placeholder="Customer complaint"
              />
            </label>

            <label>
              Existing condition

              <select name="condition">
                <option value="Normal used condition">
                  Normal used condition
                </option>

                <option value="Screen cracked">
                  Screen cracked
                </option>

                <option value="Back damaged">
                  Back damaged
                </option>

                <option value="Water marks">
                  Water marks
                </option>
              </select>
            </label>
          </div>

          <label>
            Accessories / condition notes

            <textarea
              name="conditionNotes"
              placeholder="Cover received, SIM removed, scratches on frame..."
            />
          </label>
        </Card>

        {/* ASSIGNMENT */}

        <Card>
          <h3>Assignment & Promise</h3>

          <div className="formgrid">
            <label>
              Technician

              <select name="tech">
                <option value="">
                  Assign later
                </option>

                {techs.filter(t=>t.status!=='Inactive').map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                  >
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Deadline

              <input
                name="deadline"
                type="datetime-local"
                required
              />
            </label>

            <label>
              Base service estimate (excluding parts)

              <input
                name="total"
                type="number"
                min="0"
                step="1"
                placeholder="0"
              />
            </label>

            <label>
              Priority

              <select name="urgency">
                <option value="ok">
                  Normal
                </option>

                <option value="warning">
                  Urgent
                </option>

                <option value="critical">
                  Critical
                </option>
              </select>
            </label>
          </div>
        </Card>

        <Card><h3>Spare Parts at Reception</h3><p>Attach known parts now. Blank unit price uses the current cost. Stock and the repair bill update together.</p>{parts.map((p,i)=><div className="formgrid" key={i}><label>Part<select required value={p.productId} onChange={e=>setParts(parts.map((x,j)=>j===i?{...x,productId:e.target.value}:x))}><option value="">Select spare part</option>{products.filter(x=>x.active&&x.qty>0).map(x=><option key={x.id} value={x.id}>{x.name} · {money(x.cost)} cost</option>)}</select></label><label>Quantity<input required type="number" min="0.001" step="0.001" value={p.qty} onChange={e=>setParts(parts.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}/></label><label>Unit price (PKR)<input type="number" min={products.find(x=>x.id===p.productId)?.cost||0} step="0.01" placeholder="Default: cost price" value={p.price} onChange={e=>setParts(parts.map((x,j)=>j===i?{...x,price:e.target.value}:x))}/></label><button type="button" className="btn ghost" onClick={()=>setParts(parts.filter((_,j)=>j!==i))}>Remove</button></div>)}<button type="button" className="btn ghost" onClick={()=>setParts([...parts,{productId:'',qty:1,price:''}])}>Add Spare Part</button></Card>
        <div className="sticky-actions">
          <button
            type="button"
            className="btn ghost"
          >
            <Printer size={17} />
            Print Preview
          </button>

          <button
            type="submit"
            className="btn primary"
            disabled={saving}
          >
            <Plus size={17} />

            {saving
              ? 'Creating Job...'
              : 'Receive Device & Create Job'}
          </button>
        </div>
      </form>
    </>
  )
}

/* =========================================================
   REPAIR DETAIL
========================================================= */

export function RepairDetail() {
  const { id } = useParams()
  const { repairs, products, profile, updateRepair, useRepairPart, returnRepairPart, setRepairLabourCharge, requestHandover, users,reload,techs } = useApp()
  const r = repairs.find(x => String(x.id) === String(id))
  const [busy,setBusy]=useState(false),[partId,setPartId]=useState(''),[qty,setQty]=useState(1),[charge,setCharge]=useState(''),[labourCharge,setLabourCharge]=useState(r?.labourCharge||0),[cashier,setCashier]=useState('')
  const[edit,setEdit]=useState(null),[editError,setEditError]=useState('');
  if(!r)return <><PageHead title="Repair Not Found" subtitle="The requested repair job could not be found."/><Card><div className="empty-inline">Repair {id} was not found.</div></Card></>
  const role=profile?.role,isTech=role==='Technician',canWork=isTech||['Developer','Admin','Manager'].includes(role),availableParts=products.filter(p=>p.active!==false&&Number(p.qty)>0)
  const activeCashiers=users.filter(u=>u.active!==false&&['Cashier','Manager','Admin','Developer'].includes(u.role))
  const total=Number(r.total||0),paid=Number(r.paid||0),balance=Math.max(0,total-paid)
  const act=async fn=>{try{setBusy(true);await fn()}catch(e){alert(e.message||String(e))}finally{setBusy(false)}}
  const addPart=()=>{if(!partId)return alert('Select a part.');act(()=>useRepairPart(r.dbId,partId,Number(qty),charge===''?null:Number(charge)))}
  const saveLabour=()=>act(()=>setRepairLabourCharge(r.dbId,Number(labourCharge||0)));const handover=()=>{if(!cashier)return alert('Select receiving cashier.');act(()=>requestHandover(r.dbId,cashier))}
  return <><PageHead title={`${r.id} · ${r.phone}`} subtitle={`${r.customer} · ${r.customerPhone||'No phone number'}`} actions={<><button className="btn ghost" type="button"><Printer size={17}/>Print</button>{canWork&&r.status==='Assigned'&&<button className="btn primary" disabled={busy} onClick={()=>act(()=>updateRepair(r.id,{status:'Repairing'}))}>Start Repair</button>}</>}/>
  <div className="detail-grid"><Card><h3>Job Timeline</h3>{['Received','Assigned','Repairing','Ready for Handover','Completed','Delivered'].map((stage,i)=><div key={stage} className={`timeline ${stage===r.status?'current':''}`}><span>{i+1}</span><div><b>{stage}</b><small>{stage===r.status?'Current stage':'Workflow stage'}</small></div></div>)}</Card>
  <div className="stack"><Card><h3>Device & Customer</h3>{['Cashier','Admin','Manager','Developer'].includes(role)&&<button className="btn ghost" onClick={()=>{setEdit({customer:r.customer,customerPhone:r.customerPhone,brand:r.brand,model:r.model,imei:r.imei,issue:r.issue,conditionNotes:r.conditionNotes,accessories:r.accessories,technicianId:r.technicianId||'',deadline:r.deadlineRaw?new Date(new Date(r.deadlineRaw).getTime()-new Date(r.deadlineRaw).getTimezoneOffset()*60000).toISOString().slice(0,16):''});setEditError('')}}>Edit Repair Details</button>}<div className="info"><span>Customer</span><b>{r.customer}</b><span>Phone</span><b>{r.customerPhone||'—'}</b><span>Device</span><b>{r.phone}</b><span>IMEI</span><b>{r.imei||'—'}</b><span>Complaint</span><b>{r.issue}</b><span>Technician</span><b>{r.tech||'Unassigned'}</b><span>Deadline</span><b>{r.deadline||'—'}</b><span>Status</span><b><Badge>{r.status}</Badge></b></div></Card>
  <Card><h3>Parts Used</h3>{(r.parts||[]).length===0?<p>No parts attached yet.</p>:(r.parts||[]).map((p,i)=><div className="ledgerline" key={p.id||`${p.name}-${i}`}><span><b>{p.name||p}</b>{p.qty?` × ${p.qty}`:''}<small>{money(p.charge)} total · Technician share: {p.percentage==null?'staff default':`${p.percentage}%`} of part profit</small></span><span>{p.state||'Used'}</span>{canWork&&p.id&&p.state==='Used'&&<button className="btn ghost sm" onClick={()=>{const reason=prompt('Reason for returning this part:');if(reason)act(()=>returnRepairPart(p.id,reason))}}>Return Part</button>}</div>)}</Card>
  {canWork&&['Assigned','Repairing','Warranty'].includes(r.status)&&<Card><h3>Attach Part From Inventory</h3><div className="formgrid"><label>Part<select value={partId} onChange={e=>setPartId(e.target.value)}><option value="">Select available part</option>{availableParts.map(p=><option key={p.id} value={p.id}>{p.name} · Stock {p.qty}</option>)}</select></label><label>Quantity<input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Customer unit price (blank = cost)<input type="number" min="0" value={charge} onChange={e=>setCharge(e.target.value)}/></label></div><button className="btn primary" disabled={busy} onClick={addPart}>Attach & Consume Part</button></Card>}
  {canWork&&['Assigned','Repairing','Warranty'].includes(r.status)&&<Card><h3>Technician / Labour Charge</h3><p>Add the technician work charge separately from inventory parts. This amount is added to the customer repair bill.</p><div className="formgrid"><label>Labour / Work Charge<input type="number" min="0" step="1" value={labourCharge} onChange={e=>setLabourCharge(e.target.value)}/></label></div><button className="btn primary" disabled={busy} onClick={saveLabour}>Save Labour Charge</button></Card>}
  {canWork&&['Assigned','Repairing','Warranty'].includes(r.status)&&<Card><h3>Finish Workshop & Handover</h3><p>Select the cashier who will physically receive the repaired device.</p><select value={cashier} onChange={e=>setCashier(e.target.value)}><option value="">Select cashier</option>{activeCashiers.map(u=><option key={u.id} value={u.id}>{u.name||u.full_name}</option>)}</select><button className="btn primary" disabled={busy||!cashier} onClick={handover}><Handshake size={17}/>Ready & Request Handover</button></Card>}
  <Card><h3>Repair Billing</h3><div className="info"><span>Parts / Estimate</span><b>{money(Math.max(0,total-Number(r.labourCharge||0)))}</b><span>Technician / Labour</span><b>{money(Number(r.labourCharge||0))}</b><span>Total bill</span><b>{money(total)}</b><span>Paid</span><b>{money(paid)}</b><span>Balance</span><b>{money(balance)}</b></div>{['Cashier','Manager','Admin','Developer'].includes(role)&&['Ready for Handover','Completed'].includes(r.status)&&<Link className="btn primary" to="/repairs/return">Open Customer Return Desk</Link>}</Card></div></div>{edit&&<div className="modal-backdrop"><Card className="modal-card"><h3>Edit {r.id}</h3><p>Correct customer and device information. Financial changes remain in the billing workflow.</p><form onSubmit={async e=>{e.preventDefault();try{setBusy(true);await backend.editRepair(r.dbId,{...edit,deadline:edit.deadline?new Date(edit.deadline).toISOString():null});await reload();setEdit(null)}catch(e){setEditError(e.message)}finally{setBusy(false)}}}><div className="formgrid">{[['customer','Customer'],['customerPhone','Mobile'],['brand','Brand'],['model','Model'],['imei','IMEI'],['issue','Complaint'],['conditionNotes','Condition'],['accessories','Accessories']].map(([key,label])=><label key={key}>{label}<input required={['customer','model','issue'].includes(key)} value={edit[key]} onChange={e=>setEdit({...edit,[key]:e.target.value})}/></label>)}<label>Deadline<input type="datetime-local" value={edit.deadline} onChange={e=>setEdit({...edit,deadline:e.target.value})}/></label><label>Technician<select value={edit.technicianId} onChange={e=>setEdit({...edit,technicianId:e.target.value})}><option value="">Unassigned</option>{techs.filter(t=>t.status!=='Inactive').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>{editError&&<p role="alert">{editError}</p>}<div className="split-actions"><button type="button" className="btn ghost" disabled={busy} onClick={()=>setEdit(null)}>Cancel</button><button className="btn primary" disabled={busy}>Save Changes</button></div></form></Card></div>}</>
}

export function CustomerReturn(){
 const{handovers=[],repairs=[],profile,acceptHandover,collectRepairPayment,deliverRepair}=useApp();const[q,setQ]=useState(''),[busy,setBusy]=useState('');
 const mine=handovers.filter(h=>!h.accepted_at||['Completed','Ready for Handover'].includes(h.repairStatus)).filter(h=>`${h.jobNo} ${h.customer} ${h.customerPhone} ${h.phone}`.toLowerCase().includes(q.toLowerCase()));
 const perform=async(key,fn)=>{try{setBusy(key);await fn()}catch(e){alert(e.message||String(e))}finally{setBusy('')}};
 return <><PageHead title="Customer Return & Payment" subtitle="Accept technician custody, collect repair payment, print the bill and return the device to the customer."/><div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search repair, customer or phone..."/></div><div className="stack">{mine.map(h=>{const r=repairs.find(x=>x.dbId===h.repair_id),total=Number(r?.total??h.total??0),paid=Number(r?.paid??h.paid??0),balance=Math.max(0,total-paid),accepted=!!h.accepted_at;return <Card key={h.id}><div className="techjob-head"><div><b>{h.jobNo}</b><h3>{h.phone}</h3><p>{h.customer} · From {h.fromName}</p></div><Badge>{accepted?'Cashier Accepted':'Waiting Acceptance'}</Badge></div><div className="info"><span>Total</span><b>{money(total)}</b><span>Paid</span><b>{money(paid)}</b><span>Balance</span><b>{money(balance)}</b></div><div className="split-actions">{!accepted&&<button className="btn primary" disabled={busy===h.id} onClick={()=>perform(h.id,()=>acceptHandover(h.id))}><Handshake size={17}/>Accept Device</button>}{accepted&&balance>0&&<button className="btn primary" disabled={busy===h.id} onClick={()=>{const raw=prompt(`Amount received (balance ${money(balance)}):`,String(balance));if(raw!==null&&Number(raw)>0)perform(h.id,()=>collectRepairPayment(h.repair_id,Math.min(Number(raw),balance),'Cash'))}}>{money(balance)} · Collect Cash</button>}{accepted&&balance===0&&r?.status==='Completed'&&<button className="btn primary" disabled={busy===h.id} onClick={()=>perform(h.id,()=>deliverRepair(h.repair_id))}><CheckCircle2 size={17}/>Return to Customer</button>}<button className="btn ghost" type="button" onClick={()=>window.print()}><Printer size={17}/>Print Bill</button></div></Card>})}{!mine.length&&<Card><div className="empty-inline">No repairs are waiting at the customer return desk.</div></Card>}</div></>
}
